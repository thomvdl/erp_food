<?php

namespace App\Http\Controllers\Api;

use App\Events\KioskCheckoutFailed;
use App\Events\KioskCheckoutPaid;
use App\Events\OrderKitchenUpdated;
use App\Http\Controllers\Controller;
use App\Models\KioskCheckout;
use App\Models\PaymentMethod;
use App\Support\KioskSaleRecorder;
use Illuminate\Http\Request;

/**
 * Reçoit les webhooks Stripe pour le paiement kiosque QR/Bancontact (voir KioskCheckoutController)
 * — signature vérifiée en amont par Laravel\Cashier\Http\Middleware\VerifyWebhookSignature (voir
 * routes/api.php). Bancontact confirme en fait EN DIRECT pendant la redirection bancaire — le
 * client "revient sur success_url avec une notification immédiate du succès ou de l'échec" (voir
 * doc Stripe, "Accept a Bancontact payment") — donc `checkout.session.completed` (avec
 * `payment_status: 'paid'`) est l'event normal ici, pas les events async_payment_*, réservés aux
 * moyens réellement différés (SEPA, virements...) qu'on n'utilise pas. On les gère quand même en
 * plus par prudence (defensive, coûte rien), et `checkout.session.expired` couvre le cas où le
 * client abandonne sans finaliser (30 min, voir KioskCheckoutController::store).
 */
class StripeWebhookController extends Controller
{
    public function handle(Request $request)
    {
        $session = $request->input('data.object', []);

        match ($request->input('type')) {
            'checkout.session.completed' => $this->handleCompleted($session),
            'checkout.session.async_payment_succeeded' => $this->markPaid($session),
            'checkout.session.async_payment_failed' => $this->markFailed($session, 'failed'),
            'checkout.session.expired' => $this->markFailed($session, 'expired'),
            default => null,
        };

        // Toujours 200 (sauf signature invalide, rejetée par le middleware en amont) — Stripe
        // réessaie automatiquement un webhook non-200, ce qu'on ne veut pas pour un event qu'on
        // ignore volontairement.
        return response()->json(['received' => true]);
    }

    /**
     * Bancontact ne complète la session QUE si l'authentification bancaire a réussi (sinon le
     * client reste sur la page Checkout pour réessayer, voir doc Stripe) — payment_status devrait
     * donc toujours valoir 'paid' ici en pratique, mais on vérifie plutôt que de le supposer.
     */
    private function handleCompleted(array $session): void
    {
        if (($session['payment_status'] ?? null) === 'paid') {
            $this->markPaid($session);
        }
    }

    private function markPaid(array $session): void
    {
        $kioskCheckout = KioskCheckout::query()->where('stripe_checkout_session_id', $session['id'] ?? null)->first();

        // Idempotence : Stripe peut renvoyer le même event plusieurs fois (retries réseau) — ne
        // jamais matérialiser deux fois la même vente. Pas de KioskCheckout trouvé n'est pas non
        // plus une erreur : la session n'a peut-être plus rien à voir avec ce flux.
        if (!$kioskCheckout || $kioskCheckout->status === 'paid') {
            return;
        }

        // "QR Code", pas "Bancontact" : distinct du variant Terminal (simulé, voir
        // KioskOrderController) pour pouvoir reconnaître/réconcilier séparément les deux dans les
        // rapports de caisse, même si les deux passent par Bancontact au sens du réseau bancaire.
        $paymentMethodId = PaymentMethod::query()->where('slug', 'qr-code')->value('id');

        [$ticket, $order] = KioskSaleRecorder::record(
            $kioskCheckout->lines,
            $kioskCheckout->cashSession,
            $kioskCheckout->discount,
            (float) ($kioskCheckout->discount_amount ?? 0),
            $kioskCheckout->client,
            [['payment_method_id' => $paymentMethodId, 'value' => (float) $kioskCheckout->total]],
            (int) ($kioskCheckout->points_earned ?? 0),
            (int) ($kioskCheckout->points_redeemed ?? 0),
            (float) ($kioskCheckout->points_redeemed_amount ?? 0),
            $kioskCheckout->table_number,
        );

        $kioskCheckout->update(['status' => 'paid', 'ticket_id' => $ticket->id]);

        event(new OrderKitchenUpdated($order->id));
        event(new KioskCheckoutPaid($kioskCheckout->id));
    }

    private function markFailed(array $session, string $status): void
    {
        $kioskCheckout = KioskCheckout::query()->where('stripe_checkout_session_id', $session['id'] ?? null)->first();

        if (!$kioskCheckout || $kioskCheckout->status !== 'pending') {
            return;
        }

        $kioskCheckout->update(['status' => $status]);

        event(new KioskCheckoutFailed($kioskCheckout->id));
    }
}
