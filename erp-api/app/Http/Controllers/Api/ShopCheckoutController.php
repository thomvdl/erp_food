<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Param;
use App\Models\Product;
use App\Models\ProductCatalog;
use App\Models\ShopCheckout;
use App\Support\DeliveryZone;
use App\Support\DiscountCalculator;
use App\Support\LoyaltyPoints;
use App\Support\MenuResolver;
use App\Support\ShopCheckoutConfirmer;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Laravel\Cashier\Checkout;

/**
 * Paiement en ligne de la boutique (erp_public_shop), même famille que le variant "QR code" du
 * kiosque (voir KioskCheckoutController) : la commande n'est confirmée par la banque qu'après
 * cette requête (redirection Stripe Checkout), donc on ne crée ni Ticket ni Order ici — on fige
 * ce qui doit l'être (lignes, prix, mode de retrait) dans un ShopCheckout `pending`, et c'est le
 * webhook Stripe qui matérialise la vente une fois le paiement confirmé (voir
 * StripeWebhookController et App\Support\ShopSaleRecorder). Contrairement au kiosque : pas de
 * QR (c'est l'appareil principal du client, pas un second appareil scanné) — on redirige
 * directement vers l'URL Stripe Checkout ; pas de CashSession (aucun caissier physique) ; et
 * l'adresse de livraison est désormais saisie et validée AVANT cette requête (topbar du site,
 * voir App\Support\DeliveryZone et shared/delivery-address côté front) — plus besoin que Stripe
 * la collecte lui-même, elle est simplement revérifiée puis figée sur le ShopCheckout ici.
 */
class ShopCheckoutController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'fulfillment_type' => ['required', 'string', 'in:pickup,delivery'],
            'customer_email' => ['required', 'email', 'max:255'],
            // Contrairement au kiosque (réservé aux superviseurs, voir KioskCheckoutController) :
            // pas de garde de rôle, il n'y a pas d'utilisateur connecté sur cette route publique
            // — n'importe quel client peut saisir un code.
            'discount_code' => ['nullable', 'string'],
            // Compte client optionnel (voir ShopCustomerController) — jamais un client_id brut,
            // toujours reroutée par le numéro OU l'email (même principe que
            // ShopCustomerController::orders, voir Client::findByPhoneOrEmail ci-dessous).
            'customer_phone' => ['nullable', 'string', 'max:50'],
            'points_redeemed' => ['nullable', 'integer', 'min:1'],
            // Requise si delivery — voir App\Support\DeliveryZone, revérifiée ci-dessous (jamais
            // confiance au résultat déjà affiché côté client par shop/delivery-check).
            'delivery_address' => ['required_if:fulfillment_type,delivery', 'nullable', 'string', 'max:500'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'lines.*.quantity' => ['required', 'integer', 'min:1', 'max:20'],
            'lines.*.note' => ['nullable', 'string', 'max:255'],
            // Requis uniquement si le produit est un menu (is_menu) — voir App\Support\MenuResolver.
            'lines.*.menu_choices' => ['array'],
            'lines.*.menu_choices.*.menu_group_id' => ['integer'],
            'lines.*.menu_choices.*.product_ids' => ['array'],
            'lines.*.menu_choices.*.product_ids.*' => ['integer'],
            'lines.*.menu_choices.*.product_notes' => ['array'],
            'lines.*.menu_choices.*.product_notes.*.product_id' => ['integer'],
            'lines.*.menu_choices.*.product_notes.*.note' => ['nullable', 'string', 'max:255'],
            // Bouton "Simuler le paiement" (voir simulate() plus bas) — ignoré hors dev/test
            // (même garde que simulate()) : jamais de vraie commande créée sans session Stripe
            // en production, même si un client forgeait cette requête à la main.
            'simulate' => ['boolean'],
        ]);
        $simulate = ($data['simulate'] ?? false) && !app()->isProduction();

        // Voir Client::findByPhoneOrEmail — jamais créé ici, juste retrouvé s'il existe déjà.
        // customer_email est toujours fourni (voir validation ci-dessus) donc ceci résout aussi
        // les comptes Google/mot de passe, qui n'ont généralement pas de téléphone.
        $client = Client::findByPhoneOrEmail($data['customer_phone'] ?? null, $data['customer_email']);

        $catalogIds = ProductCatalog::query()->where('active_public_shop', true)->where('active', true)->pluck('id');

        if ($catalogIds->isEmpty()) {
            throw ValidationException::withMessages([
                'lines' => ['Aucun catalogue disponible pour le moment.'],
            ]);
        }

        // Même garde-fou que KioskCheckoutController::store : ne fait jamais confiance au front
        // pour savoir quels produits sont vraiment vendus en ligne.
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

        // Voir App\Support\MenuResolver::expandLines — résolu ici et figé tel quel dans
        // shop_checkouts.lines (le webhook Stripe ne recalcule jamais, voir docblock de classe).
        $lines = MenuResolver::expandLines($data['lines'], $products);

        $total = array_sum(array_map(fn (array $line) => $line['unit_price'] * $line['quantity'], $lines));

        // Réduction recalculée côté serveur (voir DiscountCalculator) — jamais un montant/total
        // envoyé par le client. Appliquée au sous-total marchandise, AVANT les frais de livraison
        // (une réduction porte sur les produits, pas sur le transport).
        $discount = null;
        $discountAmount = 0.0;
        if (!empty($data['discount_code'])) {
            $discount = DiscountCalculator::resolve($data['discount_code']);
            $discountAmount = DiscountCalculator::amountOff($discount, $lines, $total);
            $total = max(round($total - $discountAmount, 2), 0);
        }

        // Points de fidélité (voir App\Support\LoyaltyPoints, même pattern que
        // KioskCheckoutController::store) — figés ici comme la réduction, jamais recalculés par
        // le webhook Stripe. `points_earned` calculé sur le total net APRÈS réduction/points,
        // AVANT frais de livraison (la fidélité porte sur les produits, pas le transport).
        $pointsRedeemed = $data['points_redeemed'] ?? 0;
        $pointsRedeemedAmount = 0.0;
        if ($pointsRedeemed > 0) {
            $pointsRedeemedAmount = LoyaltyPoints::amountOff($pointsRedeemed, $client, $total);
            $total = max(round($total - $pointsRedeemedAmount, 2), 0);
        }
        $pointsEarned = $client ? LoyaltyPoints::earned($total) : null;

        // Frais de livraison : montant fixe configurable depuis Paramètres > Réglages (table
        // Param générique, voir Param::class) — 0 si le réglage n'a pas encore été créé.
        $deliveryFee = null;
        $deliveryAddress = null;
        if ($data['fulfillment_type'] === 'delivery') {
            $deliveryFee = (float) (Param::query()->where('name', 'shop_delivery_fee')->value('value') ?? 0);
            $total = round($total + $deliveryFee, 2);

            // Revérifie toujours côté serveur — jamais confiance au résultat déjà affiché par
            // POST shop/delivery-check dans la topbar (voir App\Support\DeliveryZone). L'adresse
            // formatée par Nominatim (pas la saisie brute du client) est celle qu'on fige.
            $zone = DeliveryZone::checkAddress($data['delivery_address']);
            if (!$zone['within_radius']) {
                throw ValidationException::withMessages([
                    'delivery_address' => ['Cette adresse est hors de la zone de livraison.'],
                ]);
            }
            $deliveryAddress = $zone['formatted_address'];
        }

        if ($total < 0.5) {
            // Minimum Stripe pour un paiement carte en EUR.
            throw ValidationException::withMessages([
                'lines' => ['Le montant total est trop faible pour un paiement par carte (minimum 0,50 €).'],
            ]);
        }

        // Créée AVANT la session Stripe (contrairement au kiosque) : la page de confirmation du
        // site a besoin de connaître cet id pour interroger show() ci-dessous au retour de
        // Stripe — voir migration create_shop_checkouts_table.
        $shopCheckout = ShopCheckout::query()->create([
            'status' => 'pending',
            'fulfillment_type' => $data['fulfillment_type'],
            'lines' => $lines,
            'total' => $total,
            'delivery_fee' => $deliveryFee,
            'delivery_address' => $deliveryAddress,
            'customer_email' => $data['customer_email'] ?? null,
            'discount_id' => $discount?->id,
            'discount_amount' => $discount ? round($discountAmount, 2) : null,
            'client_id' => $client?->id,
            'points_earned' => $pointsEarned,
            'points_redeemed' => $pointsRedeemed > 0 ? $pointsRedeemed : null,
            'points_redeemed_amount' => $pointsRedeemed > 0 ? round($pointsRedeemedAmount, 2) : null,
        ]);

        // $simulate : aucune session Stripe créée du tout — le front appellera simulate() juste
        // après avec cet id (voir checkout.ts) au lieu de rediriger vers checkout_url. Sans ce
        // court-circuit, store() exigeait des clés Stripe même pour tester le parcours en
        // dev/test alors que simulate() n'en a jamais eu besoin lui-même.
        if ($simulate) {
            return response()->json(['id' => $shopCheckout->id, 'checkout_url' => null], 201);
        }

        $shopUrl = rtrim(config('app.shop_url'), '/');

        $checkoutSession = Checkout::guest()->create([
            [
                'price_data' => [
                    'currency' => config('cashier.currency'),
                    'product_data' => ['name' => 'Commande boutique en ligne'],
                    'unit_amount' => (int) round($total * 100),
                ],
                'quantity' => 1,
            ],
        ], array_filter([
            'mode' => 'payment',
            // null omis (pas envoyé du tout) plutôt que transmis tel quel à Stripe — voir
            // array_filter ci-dessous.
            'customer_email' => $data['customer_email'] ?? null,
            'phone_number_collection' => ['enabled' => true],
            'success_url' => "{$shopUrl}/confirmation?checkout={$shopCheckout->id}&status=success",
            'cancel_url' => "{$shopUrl}/confirmation?checkout={$shopCheckout->id}&status=cancel",
            'expires_at' => now()->addMinutes(30)->timestamp,
        ], fn ($value) => $value !== null));

        $shopCheckout->update(['stripe_checkout_session_id' => $checkoutSession->id]);

        return response()->json([
            'id' => $shopCheckout->id,
            'checkout_url' => $checkoutSession->url,
        ], 201);
    }

    /**
     * Polling de confirmation pour pages/confirmation (voir shop-checkout-echo.service.ts côté
     * front, même filet de secours que KioskCheckoutController::show) : le paiement est
     * normalement confirmé en temps réel via l'event `ShopCheckoutPaid` (canal
     * `shop-checkout.{id}`, voir StripeWebhookController), mais on garde ce polling comme
     * rattrapage si le websocket est coupé.
     */
    public function show(ShopCheckout $shopCheckout)
    {
        // `shop_checkouts.lines` (voir MenuResolver::expandLines) ne fige que product_id/prix —
        // jamais le nom, qui pourrait changer entre la commande et son affichage ici. Résolu à la
        // volée plutôt que dupliqué en base, même principe que delivery-list.ts côté Gestion
        // (join sur products via product_id).
        $productNames = Product::query()
            ->whereIn('id', collect($shopCheckout->lines)->pluck('product_id')->unique())
            ->pluck('name', 'id');

        $lines = collect($shopCheckout->lines)
            ->map(fn (array $line) => [...$line, 'product_name' => $productNames->get($line['product_id'])])
            ->values();

        return response()->json([
            'status' => $shopCheckout->status,
            'fulfillment_type' => $shopCheckout->fulfillment_type,
            'total' => $shopCheckout->total,
            'delivery_fee' => $shopCheckout->delivery_fee,
            'delivery_address' => $shopCheckout->delivery_address,
            'discount_amount' => $shopCheckout->discount_amount,
            'points_earned' => $shopCheckout->points_earned,
            'points_redeemed_amount' => $shopCheckout->points_redeemed_amount,
            'lines' => $lines,
        ]);
    }

    /**
     * Environnement de dev/test uniquement — jamais en production (404 sinon, voir
     * app()->isProduction() ci-dessous) : bouton "Simuler le paiement" de pages/checkout côté
     * front, pour tester le parcours complet sans passer par une vraie session Stripe à chaque
     * essai. Matérialise la vente avec un nom/téléphone fictifs via App\Support\ShopCheckoutConfirmer
     * — exactement la même logique que StripeWebhookController::markShopCheckoutPaid pour un vrai
     * paiement. L'adresse de livraison, elle, n'est jamais fictive : c'est la vraie adresse déjà
     * saisie/validée à la création du ShopCheckout (voir ShopCheckoutController::store).
     */
    public function simulate(ShopCheckout $shopCheckout)
    {
        abort_if(app()->isProduction(), 404);

        ShopCheckoutConfirmer::confirm(
            $shopCheckout,
            'Client de test',
            $shopCheckout->customer_email,
            '+32 400 00 00 00',
        );

        return response()->json(['status' => $shopCheckout->fresh()->status]);
    }
}
