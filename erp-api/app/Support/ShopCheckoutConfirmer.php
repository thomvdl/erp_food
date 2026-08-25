<?php

namespace App\Support;

use App\Events\OrderKitchenUpdated;
use App\Events\ShopCheckoutPaid;
use App\Models\PaymentMethod;
use App\Models\ShopCheckout;

/**
 * Matérialise un ShopCheckout payé (Ticket + Order, voir App\Support\ShopSaleRecorder) et diffuse
 * les events associés — extrait de StripeWebhookController::markShopCheckoutPaid pour être
 * partagé avec ShopCheckoutController::simulate (voir son docblock : bouton de test qui simule un
 * paiement Stripe réussi sans vraie session, jamais actif en production). Les deux appelants ne
 * diffèrent que par la provenance du nom/téléphone (Stripe réel vs valeurs de test) — l'adresse de
 * livraison, la réduction et le compte client/points fidélité éventuels, eux, sont déjà connus et
 * figés AVANT le paiement (voir App\Support\DeliveryZone/DiscountCalculator/LoyaltyPoints,
 * ShopCheckoutController::store), donc lus directement sur `$shopCheckout` plutôt que reçus en
 * paramètre.
 */
class ShopCheckoutConfirmer
{
    public static function confirm(
        ShopCheckout $shopCheckout,
        ?string $customerName,
        ?string $customerEmail,
        ?string $customerPhone,
    ): void {
        // Idempotence : Stripe peut renvoyer le même event plusieurs fois (retries réseau) — ne
        // jamais matérialiser deux fois la même vente.
        if ($shopCheckout->status === 'paid') {
            return;
        }

        $paymentMethodId = PaymentMethod::query()->where('slug', 'boutique-en-ligne')->value('id');

        // Si un compte client est lié (voir ShopCheckoutController::store, résolu par téléphone ou
        // email — jamais un client_id brut fait confiance côté front), son nom/téléphone
        // enregistrés priment sur ceux saisis dans le formulaire Stripe : ce dernier n'est que le
        // nom/téléphone du titulaire de la carte au moment du paiement, pas forcément celui du
        // compte identifié (carte d'un proche, autofill du navigateur...) — voir Gestion >
        // Livraison, qui affiche ces valeurs pour contacter le bon client.
        $client = $shopCheckout->client;
        $resolvedName = $client ? trim("{$client->firstname} {$client->lastname}") : $customerName;
        $resolvedPhone = $client?->phone ?? $customerPhone;

        [$ticket, $order] = ShopSaleRecorder::record(
            $shopCheckout->lines,
            $shopCheckout->fulfillment_type,
            $shopCheckout->delivery_address,
            (float) $shopCheckout->total,
            $paymentMethodId,
            $resolvedName,
            $resolvedPhone,
            $shopCheckout->discount,
            (float) ($shopCheckout->discount_amount ?? 0),
            $client,
            (int) ($shopCheckout->points_earned ?? 0),
            (int) ($shopCheckout->points_redeemed ?? 0),
            (float) ($shopCheckout->points_redeemed_amount ?? 0),
        );

        $shopCheckout->update([
            'status' => 'paid',
            'ticket_id' => $ticket->id,
            'customer_name' => $resolvedName,
            'customer_email' => $customerEmail ?? $shopCheckout->customer_email,
            'customer_phone' => $resolvedPhone,
        ]);

        event(new OrderKitchenUpdated($order->id));
        event(new ShopCheckoutPaid($shopCheckout->id));
    }
}
