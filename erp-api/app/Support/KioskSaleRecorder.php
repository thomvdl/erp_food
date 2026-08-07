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
 * Matérialise une vente kiosque : crée à la fois le Ticket (encaissement) et l'Order SANS table
 * (visible en cuisine) dans la même transaction — voir docblock de KioskOrderController pour le
 * pourquoi de ce double enregistrement. Extrait de KioskOrderController::store pour être partagé
 * avec le webhook Stripe (voir StripeWebhookController) : le paiement QR/Bancontact confirme de
 * façon asynchrone, potentiellement bien après la requête initiale du kiosque, donc un autre point
 * d'entrée que le contrôleur a besoin d'exécuter exactement la même logique.
 */
class KioskSaleRecorder
{
    /**
     * @param  array<int, array{product_id: int, quantity: int, unit_price: float}>  $lines  déjà
     *         figées (prix résolu au moment du scan/vente, jamais recalculé ici)
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
            // Voir App\Support\StockManager — couvre les deux variants de paiement kiosque
            // (Terminal et QR, ce dernier via StripeWebhookController qui appelle ce même record()).
            StockManager::consume($lines);

            $ticket = Ticket::query()->create([
                'paid_at' => now(),
                'client_id' => $client?->id,
                'source' => 'kiosk',
                'discount_id' => $discount?->id,
                'discount_amount' => $discount ? round($discountAmount, 2) : null,
                'points_earned' => $client ? $pointsEarned : null,
                'points_redeemed' => $pointsRedeemed > 0 ? $pointsRedeemed : null,
                'points_redeemed_amount' => $pointsRedeemed > 0 ? round($pointsRedeemedAmount, 2) : null,
            ]);

            $ticketSection = TicketSection::query()->create([
                'name' => 'Kiosque',
                'ticket_id' => $ticket->id,
            ]);

            foreach ($lines as $line) {
                $ticketSection->lines()->create([
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'product_id' => $line['product_id'],
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
            $order = Order::query()->create(['state' => 'ask', 'ticket_id' => $ticket->id, 'source' => 'kiosk']);
            $section = $order->sections()->create(['name' => 'Kiosque', 'state' => 'ask', 'asked_at' => now()]);
            // Voir order_sections.stock_consumed — déjà décrémenté juste au-dessus
            // (StockManager::consume($lines)), purement pour cohérence de la donnée (cette Order
            // ne passe jamais par OrderController::pay/destroy, qui sont les seuls lecteurs de ce
            // flag, mais autant ne pas laisser une section au stock réellement consommé marquée
            // comme si elle ne l'était pas).
            $section->forceFill(['stock_consumed' => true])->save();

            foreach ($lines as $line) {
                $section->lines()->create([
                    'product_id' => $line['product_id'],
                    'quantity' => $line['quantity'],
                ]);
            }

            if ($client) {
                LoyaltyPoints::apply($client, $pointsEarned, $pointsRedeemed, $ticket->id);
            }

            return [$ticket, $order];
        });
    }
}
