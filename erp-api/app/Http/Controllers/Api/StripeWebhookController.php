<?php

namespace App\Http\Controllers\Api;

use App\Events\KioskCheckoutFailed;
use App\Events\KioskCheckoutPaid;
use App\Events\OrderKitchenUpdated;
use App\Events\ShopCheckoutFailed;
use App\Http\Controllers\Controller;
use App\Models\KioskCheckout;
use App\Models\PaymentMethod;
use App\Models\ShopCheckout;
use App\Support\KioskSaleRecorder;
use App\Support\ShopCheckoutConfirmer;
use Illuminate\Http\Request;

/**
 * Reçoit les webhooks Stripe pour les paiements en ligne — kiosque QR/Bancontact (voir
 * KioskCheckoutController) ET boutique en ligne (voir ShopCheckoutController) partagent le même
 * endpoint (une seule config de webhook Stripe pour l'app) — signature vérifiée en amont par
 * Laravel\Cashier\Http\Middleware\VerifyWebhookSignature (voir routes/api.php). Bancontact
 * confirme en fait EN DIRECT pendant la redirection bancaire — le client "revient sur success_url
 * avec une notification immédiate du succès ou de l'échec" (voir doc Stripe, "Accept a Bancontact
 * payment") — donc `checkout.session.completed` (avec `payment_status: 'paid'`) est l'event
 * normal ici, pas les events async_payment_*, réservés aux moyens réellement différés (SEPA,
 * virements...). On les gère quand même en plus par prudence (defensive, coûte rien), et
 * `checkout.session.expired` couvre le cas où le client abandonne sans finaliser (30 min, voir
 * KioskCheckoutController::store/ShopCheckoutController::store).
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
        $sessionId = $session['id'] ?? null;

        $kioskCheckout = KioskCheckout::query()->where('stripe_checkout_session_id', $sessionId)->first();

        if ($kioskCheckout) {
            $this->markKioskCheckoutPaid($kioskCheckout, $session);

            return;
        }

        $shopCheckout = ShopCheckout::query()->where('stripe_checkout_session_id', $sessionId)->first();

        if ($shopCheckout) {
            $this->markShopCheckoutPaid($shopCheckout, $session);
        }

        // Ni l'un ni l'autre : la session n'a peut-être plus rien à voir avec ce flux — pas une
        // erreur en soi.
    }

    private function markKioskCheckoutPaid(KioskCheckout $kioskCheckout, array $session): void
    {
        // Idempotence : Stripe peut renvoyer le même event plusieurs fois (retries réseau) — ne
        // jamais matérialiser deux fois la même vente.
        if ($kioskCheckout->status === 'paid') {
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

    /**
     * Contrairement au kiosque : nom/email/téléphone sont connus qu'ICI (collectés par Stripe
     * Checkout lui-même, voir ShopCheckoutController::store — customer_email/phone_number_collection).
     * L'adresse de livraison, elle, est saisie et validée AVANT le paiement (topbar du site, voir
     * App\Support\DeliveryZone) — déjà figée sur `$shopCheckout` par ShopCheckoutController::store,
     * ShopCheckoutConfirmer la lit directement, rien à en extraire ici.
     */
    private function markShopCheckoutPaid(ShopCheckout $shopCheckout, array $session): void
    {
        $customerDetails = $session['customer_details'] ?? [];

        // Voir App\Support\ShopCheckoutConfirmer — partagé avec ShopCheckoutController::simulate
        // (bouton de test), qui matérialise la même vente avec des coordonnées fictives.
        ShopCheckoutConfirmer::confirm(
            $shopCheckout,
            $customerDetails['name'] ?? null,
            $customerDetails['email'] ?? null,
            $customerDetails['phone'] ?? null,
        );
    }

    private function markFailed(array $session, string $status): void
    {
        $sessionId = $session['id'] ?? null;

        $kioskCheckout = KioskCheckout::query()->where('stripe_checkout_session_id', $sessionId)->first();

        if ($kioskCheckout) {
            if ($kioskCheckout->status === 'pending') {
                $kioskCheckout->update(['status' => $status]);
                event(new KioskCheckoutFailed($kioskCheckout->id));
            }

            return;
        }

        $shopCheckout = ShopCheckout::query()->where('stripe_checkout_session_id', $sessionId)->first();

        if ($shopCheckout && $shopCheckout->status === 'pending') {
            $shopCheckout->update(['status' => $status]);
            event(new ShopCheckoutFailed($shopCheckout->id));
        }
    }
}
