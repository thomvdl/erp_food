<?php

namespace App\Support;

use App\Models\Client;
use App\Models\Discount;
use App\Models\Order;
use App\Models\Ticket;
use App\Models\TicketPayment;
use App\Models\TicketSection;
use Illuminate\Support\Facades\DB;

/**
 * Matérialise une vente boutique en ligne (erp_public_shop) : crée à la fois le Ticket
 * (encaissement) et l'Order SANS table (visible en cuisine si le catalogue vendu en ligne
 * recoupe des produits préparés) dans la même transaction — même principe que
 * App\Support\KioskSaleRecorder, dont s'inspire directement cette classe. Différence
 * structurante : PAS de CashSession (aucun caissier physique derrière une vente en ligne) — le
 * TicketPayment est donc créé avec user_id/cash_session_id à null (colonnes nullable pour
 * exactement ce cas, voir migration create_ticket_payments_table : "une vente reste possible
 * sans session de caisse ouverte"). Appelée uniquement par StripeWebhookController une fois le
 * paiement Stripe confirmé (voir App\Models\ShopCheckout).
 */
class ShopSaleRecorder
{
    /**
     * @param  array<int, array{product_id: int, quantity: int, unit_price: float, note?: ?string, menu_id?: ?int, priced?: bool, hideFromKitchen?: bool}>  $lines  déjà
     *         figées (prix résolu à la commande, jamais recalculé ici) — voir
     *         App\Support\MenuResolver::expandLines.
     * @return array{0: Ticket, 1: Order}
     */
    public static function record(
        array $lines,
        string $fulfillmentType,
        ?string $deliveryAddress,
        float $total,
        int $paymentMethodId,
        ?string $customerName = null,
        ?string $customerPhone = null,
        ?Discount $discount = null,
        float $discountAmount = 0.0,
        ?Client $client = null,
        int $pointsEarned = 0,
        int $pointsRedeemed = 0,
        float $pointsRedeemedAmount = 0.0,
    ): array {
        return DB::transaction(function () use ($lines, $fulfillmentType, $deliveryAddress, $total, $paymentMethodId, $customerName, $customerPhone, $discount, $discountAmount, $client, $pointsEarned, $pointsRedeemed, $pointsRedeemedAmount) {
            // Voir App\Support\StockManager — même moment de consommation physique qu'une vente
            // kiosque (paiement = engagement définitif du stock).
            StockManager::consume($lines);

            $ticket = Ticket::query()->create([
                'paid_at' => now(),
                'source' => 'public_shop',
                'client_id' => $client?->id,
                'discount_id' => $discount?->id,
                'discount_amount' => $discount ? round($discountAmount, 2) : null,
                'points_earned' => $client ? $pointsEarned : null,
                'points_redeemed' => $pointsRedeemed > 0 ? $pointsRedeemed : null,
                'points_redeemed_amount' => $pointsRedeemed > 0 ? round($pointsRedeemedAmount, 2) : null,
            ]);

            $ticketSection = TicketSection::query()->create([
                'name' => $customerName ? "Boutique en ligne — {$customerName}" : 'Boutique en ligne',
                'ticket_id' => $ticket->id,
            ]);

            foreach ($lines as $line) {
                $ticketSection->lines()->create([
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'product_id' => $line['product_id'],
                    'note' => $line['note'] ?? null,
                    'menu_id' => $line['menu_id'] ?? null,
                ]);
            }

            TicketPayment::query()->create([
                'value' => $total,
                'payment_method_id' => $paymentMethodId,
                'ticket_id' => $ticket->id,
                'user_id' => null,
                'cash_session_id' => null,
            ]);

            // ticket_id : voir migration add_ticket_id_to_orders_table — même repère que pour le
            // kiosque, pas de lien visible côté client autre que son Ticket.
            $order = Order::query()->create([
                'state' => 'ask',
                'ticket_id' => $ticket->id,
                'source' => 'public_shop',
                'client_id' => $client?->id,
                'fulfillment_type' => $fulfillmentType,
                'delivery_address' => $deliveryAddress,
                'customer_name' => $customerName,
                'customer_phone' => $customerPhone,
                // Voir migration add_delivery_status_to_orders_table : cycle de vie dédié, géré
                // depuis erp-app > Gestion > Livraison — sans objet pour une commande "à emporter".
                'delivery_status' => $fulfillmentType === 'delivery' ? 'pending' : null,
            ]);

            $section = $order->sections()->create(['name' => 'Boutique en ligne', 'state' => 'ask', 'asked_at' => now()]);
            // Voir order_sections.stock_consumed — déjà décrémenté juste au-dessus, purement pour
            // cohérence de la donnée (même raison que KioskSaleRecorder).
            $section->forceFill(['stock_consumed' => true])->save();

            foreach ($lines as $line) {
                $orderLine = $section->lines()->create([
                    'product_id' => $line['product_id'],
                    'quantity' => $line['quantity'],
                    'note' => $line['note'] ?? null,
                    'menu_id' => $line['menu_id'] ?? null,
                    'priced' => $line['priced'] ?? true,
                ]);

                // Ligne "porteuse" d'un menu (voir App\Support\MenuResolver::expandLines) :
                // cachée du Kitchen Display, ses composants éclatés le sont déjà.
                if ($line['hideFromKitchen'] ?? false) {
                    $orderLine->forceFill(['done' => true, 'sent' => true])->save();
                }
            }

            // Voir App\Support\KitchenlessSectionCompleter : une commande sans aucun produit à
            // station (ex. une simple boisson) ne passera jamais par le kitchen display, donc
            // jamais par OrderSectionController::envoyer — sans quoi elle resterait bloquée à
            // 'ask' pour toujours.
            KitchenlessSectionCompleter::maybeAutoComplete($section);

            if ($client) {
                LoyaltyPoints::apply($client, $pointsEarned, $pointsRedeemed, $ticket->id);
            }

            return [$ticket, $order];
        });
    }
}
