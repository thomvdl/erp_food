<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CashSession;
use App\Models\Client;
use App\Models\KioskCheckout;
use App\Models\Product;
use App\Models\ProductCatalog;
use App\Support\DiscountCalculator;
use App\Support\LoyaltyPoints;
use App\Support\MenuResolver;
use App\Support\Qr;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Laravel\Cashier\Checkout;

/**
 * Variant "QR code" du paiement kiosque (voir KioskOrderController pour le variant "Terminal",
 * resté simulé — voir Readme.md) : vrai paiement Bancontact via Stripe Checkout. Le client scanne
 * le QR avec son propre téléphone et paie via sa banque, sur un appareil totalement séparé du
 * kiosque — Bancontact confirme "en direct" côté Stripe (contrairement à un moyen réellement
 * différé type SEPA, voir StripeWebhookController), mais cette confirmation arrive quand même de
 * façon complètement découplée de la requête HTTP ci-dessous : le kiosque a déjà reçu sa réponse
 * (le QR) bien avant que le client ait fini de payer sur son téléphone. Contrairement à
 * KioskOrderController::store, cette méthode ne crée donc ni Ticket ni Order : elle fige ce qui
 * doit l'être (lignes, prix, réduction) dans un KioskCheckout `pending`, et c'est le webhook
 * Stripe qui matérialise la vente une fois le paiement confirmé, via App\Support\KioskSaleRecorder
 * (même logique que le variant Terminal).
 */
class KioskCheckoutController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'cash_session_id' => ['required', 'integer', 'exists:cash_sessions,id'],
            'discount_code' => ['nullable', 'string'],
            'points_redeemed' => ['nullable', 'integer', 'min:1'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
            // Personnalisation libre (ex. "Sans oignon", voir Product::ingredients côté modale
            // panier) — même principe que TicketController::store.
            'lines.*.note' => ['nullable', 'string', 'max:255'],
            // Requis uniquement si le produit est un menu (is_menu) — voir App\Support\MenuResolver.
            'lines.*.menu_choices' => ['array'],
            'lines.*.menu_choices.*.menu_group_id' => ['integer'],
            'lines.*.menu_choices.*.product_ids' => ['array'],
            'lines.*.menu_choices.*.product_ids.*' => ['integer'],
            'lines.*.menu_choices.*.product_notes' => ['array'],
            'lines.*.menu_choices.*.product_notes.*.product_id' => ['integer'],
            'lines.*.menu_choices.*.product_notes.*.note' => ['nullable', 'string', 'max:255'],
        ]);

        $client = isset($data['client_id']) ? Client::find($data['client_id']) : null;

        $cashSession = CashSession::query()->open()->find($data['cash_session_id']);

        if (!$cashSession) {
            throw ValidationException::withMessages([
                'cash_session_id' => ["Aucune session de caisse ouverte. Ouvrez une caisse avant d'encaisser."],
            ]);
        }

        $catalogIds = ProductCatalog::query()->where('active_kiosk', true)->where('active', true)->pluck('id');

        if ($catalogIds->isEmpty()) {
            throw ValidationException::withMessages([
                'lines' => ['Aucun catalogue disponible pour le moment.'],
            ]);
        }

        // Même garde-fou que KioskOrderController::store : ne fait jamais confiance au front pour
        // savoir quels produits sont vraiment kiosque — union des catalogues actifs pour le
        // kiosque, pas un seul catalogue exclusif.
        $products = Product::query()
            ->whereHas('catalogs', fn ($query) => $query->whereIn('product_catalogs.id', $catalogIds))
            ->where('products.active', true)
            ->get()
            ->keyBy('id');

        foreach ($data['lines'] as $line) {
            if (!$products->has($line['product_id'])) {
                throw ValidationException::withMessages([
                    'lines' => ["Un des produits sélectionnés n'est plus disponible."],
                ]);
            }
        }

        // Voir App\Support\MenuResolver::expandLines — résolu ici, au moment du scan, et figé tel
        // quel dans kiosk_checkouts.lines (voir docblock de classe : le webhook Stripe ne
        // recalcule jamais, il matérialise exactement ce qui a été résolu ici).
        $lines = MenuResolver::expandLines($data['lines'], $products);

        $total = array_sum(array_map(fn (array $line) => $line['unit_price'] * $line['quantity'], $lines));

        // Réduction recalculée côté serveur (voir DiscountCalculator) — même principe que
        // KioskOrderController::store : jamais un montant/total envoyé par le client.
        $discount = null;
        $discountAmount = 0.0;
        if (!empty($data['discount_code'])) {
            abort_unless($request->user()->isAtLeastSuperviseur(), 403, "Seul un superviseur peut appliquer un code de réduction.");
            $discount = DiscountCalculator::resolve($data['discount_code']);
            $discountAmount = DiscountCalculator::amountOff($discount, $lines, $total);
            $total = max(round($total - $discountAmount, 2), 0);
        }

        // Réduction en points fidélité (voir App\Support\LoyaltyPoints) — figée ici comme le reste
        // (lignes, prix, réduction promo) : le webhook Stripe (StripeWebhookController) ne
        // recalcule jamais, il matérialise exactement ce qui a été résolu au moment du scan.
        $pointsRedeemed = $data['points_redeemed'] ?? 0;
        $pointsRedeemedAmount = 0.0;
        if ($pointsRedeemed > 0) {
            $pointsRedeemedAmount = LoyaltyPoints::amountOff($pointsRedeemed, $client, $total);
            $total = max(round($total - $pointsRedeemedAmount, 2), 0);
        }

        if ($total < 0.5) {
            // Minimum Stripe pour un paiement carte en EUR — éviter de créer une session pour un
            // montant qu'elle refuserait de toute façon (ex. réduction ramenant le total à ~0).
            throw ValidationException::withMessages([
                'lines' => ['Le montant total est trop faible pour un paiement par carte (minimum 0,50 €).'],
            ]);
        }

        $checkoutSession = Checkout::guest()->create([
            [
                'price_data' => [
                    'currency' => config('cashier.currency'),
                    'product_data' => ['name' => 'Commande kiosque'],
                    'unit_amount' => (int) round($total * 100),
                ],
                'quantity' => 1,
            ],
        ], [
            'mode' => 'payment',
            'payment_method_types' => ['bancontact'],
            'success_url' => route('kiosk-checkout.result', ['status' => 'success']),
            'cancel_url' => route('kiosk-checkout.result', ['status' => 'cancel']),
            // QR affiché sur un appareil non surveillé — durée de vie volontairement courte
            // (minimum autorisé par Stripe) plutôt que les 24h par défaut.
            'expires_at' => now()->addMinutes(30)->timestamp,
        ]);

        $kioskCheckout = KioskCheckout::query()->create([
            'stripe_checkout_session_id' => $checkoutSession->id,
            'status' => 'pending',
            'cash_session_id' => $cashSession->id,
            'client_id' => $client?->id,
            'discount_id' => $discount?->id,
            'discount_amount' => $discount ? round($discountAmount, 2) : null,
            // Gagnés sur le montant net final (après promo ET points) — figé ici pour la même
            // raison que points_redeemed, voir plus haut.
            'points_earned' => $client ? LoyaltyPoints::earned($total) : null,
            'points_redeemed' => $pointsRedeemed > 0 ? $pointsRedeemed : null,
            'points_redeemed_amount' => $pointsRedeemed > 0 ? round($pointsRedeemedAmount, 2) : null,
            'lines' => $lines,
            'total' => $total,
        ]);

        return response()->json([
            'id' => $kioskCheckout->id,
            'qr' => 'data:image/png;base64,' . base64_encode(Qr::png($checkoutSession->url)),
            'expires_at' => Carbon::createFromTimestamp($checkoutSession->expires_at)->toIso8601String(),
        ], 201);
    }

    /**
     * Filet de secours pour le kiosque (voir kiosk-payment-echo.service.ts côté front) : le
     * paiement est normalement confirmé en temps réel via l'event `KioskCheckoutPaid`
     * (canal `kiosk-checkout.{id}`, voir StripeWebhookController), mais un appareil kiosque n'est
     * pas surveillé — s'il rate l'event (websocket coupé), il peut interroger cet endpoint en
     * polling pour rattraper l'état.
     */
    public function show(KioskCheckout $kioskCheckout)
    {
        return response()->json([
            'status' => $kioskCheckout->status,
            'ticket' => $kioskCheckout->status === 'paid'
                ? $kioskCheckout->ticket->load(KioskOrderController::TICKET_WITH)
                : null,
        ]);
    }
}
