<?php

namespace App\Support;

use App\Models\CashSession;
use App\Models\Client;
use App\Models\Discount;
use App\Models\Order;
use App\Models\Ticket;
use App\Models\TicketPayment;
use App\Models\TicketSection;
use Illuminate\Support\Facades\DB;

/**
 * Matérialise une vente POS - Vente directe : crée à la fois le Ticket (encaissement) et l'Order
 * SANS table (visible en cuisine) dans la même transaction — même principe que
 * App\Support\KioskSaleRecorder, dont s'inspire directement cette classe. Différence
 * structurante : pas de repère "table_number" (le client commande et paie au comptoir, il n'y a
 * jamais de plateau/tente de table à saisir, contrairement au kiosque en mode "sur place").
 * Voir TicketController::store (POS - Vente directe : le client commande et paie au comptoir,
 * la commande part ensuite au bon poste comme un POS restaurant — plus de flux "encaissement sans
 * passage cuisine").
 */
class PosDirectSaleRecorder
{
    /**
     * @param  array<int, array{product_id: int, quantity: int, unit_price: float, note?: ?string, menu_id?: ?int, priced?: bool, hideFromKitchen?: bool}>  $lines  déjà
     *         figées (prix résolu côté serveur, jamais recalculé ici) — voir
     *         App\Support\MenuResolver::expandLines.
     * @param  array<int, array{payment_method_id: int, value: float}>  $payments
     * @param  int  $pointsEarned  voir App\Support\LoyaltyPoints::earned() — 0 si pas de client
     * @param  int  $pointsRedeemed  voir App\Support\LoyaltyPoints::amountOff() — déjà résolu/figé par l'appelant
     * @return array{0: Ticket, 1: Order}
     */
    public static function record(
        array $lines,
        CashSession $cashSession,
        ?Discount $discount,
        float $discountAmount,
        ?Client $client,
        array $payments,
        int $pointsEarned = 0,
        int $pointsRedeemed = 0,
        float $pointsRedeemedAmount = 0.0,
    ): array {
        return DB::transaction(function () use ($lines, $cashSession, $discount, $discountAmount, $client, $payments, $pointsEarned, $pointsRedeemed, $pointsRedeemedAmount) {
            // Voir App\Support\StockManager — rejette (422) si un produit à stock suivi n'a plus
            // assez d'unités, avant toute écriture.
            StockManager::consume($lines);

            $ticket = Ticket::query()->create([
                'paid_at' => now(),
                'client_id' => $client?->id,
                'source' => 'pos_vente_directe',
                'discount_id' => $discount?->id,
                'discount_amount' => $discount ? round($discountAmount, 2) : null,
                'points_earned' => $client ? $pointsEarned : null,
                'points_redeemed' => $pointsRedeemed > 0 ? $pointsRedeemed : null,
                'points_redeemed_amount' => $pointsRedeemed > 0 ? round($pointsRedeemedAmount, 2) : null,
            ]);

            $ticketSection = TicketSection::query()->create([
                'name' => 'Vente directe',
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

            foreach ($payments as $payment) {
                TicketPayment::query()->create([
                    'value' => $payment['value'],
                    'payment_method_id' => $payment['payment_method_id'],
                    'ticket_id' => $ticket->id,
                    'user_id' => $cashSession->user_id,
                    'cash_session_id' => $cashSession->id,
                ]);
            }

            // ticket_id : voir migration add_ticket_id_to_orders_table — permet au kitchen display
            // d'afficher le même numéro que celui montré/imprimé au client (son Ticket), pas
            // l'id de cette Order (purement interne, sans lien visible pour le client).
            $order = Order::query()->create(['state' => 'ask', 'ticket_id' => $ticket->id, 'source' => 'pos_vente_directe']);
            $section = $order->sections()->create(['name' => 'Vente directe', 'state' => 'ask', 'asked_at' => now()]);
            // Voir order_sections.stock_consumed — déjà décrémenté juste au-dessus
            // (StockManager::consume($lines)), purement pour cohérence de la donnée.
            $section->forceFill(['stock_consumed' => true])->save();

            foreach ($lines as $line) {
                $orderLine = $section->lines()->create([
                    'product_id' => $line['product_id'],
                    'quantity' => $line['quantity'],
                    'note' => $line['note'] ?? null,
                    'menu_id' => $line['menu_id'] ?? null,
                    'priced' => $line['priced'] ?? true,
                ]);

                // Ligne "porteuse" d'un menu (voir App\Support\MenuResolver::expandLines) : pas
                // une tâche de préparation en soi, ses composants éclatés le sont déjà — cachée
                // du Kitchen Display, même astuce que les lignes de correction.
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
