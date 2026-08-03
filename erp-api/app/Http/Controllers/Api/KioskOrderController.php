<?php

namespace App\Http\Controllers\Api;

use App\Events\OrderKitchenUpdated;
use App\Http\Controllers\Controller;
use App\Models\CashSession;
use App\Models\Order;
use App\Models\ProductCatalog;
use App\Models\Ticket;
use App\Models\TicketPayment;
use App\Models\TicketSection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * erp_self_order, mode kiosque uniquement (authentifié — voir routes/api.php, contrairement à
 * SelfOrderController qui gère le mode QR public). Ni le flux Order/OrderSection (POS Restaurant —
 * `OrderController::pay` refuse tant que les sections ne sont pas toutes 'seed', donc "payer
 * d'abord" y est impossible) ni le flux Ticket (vente directe — jamais suivi en cuisine) ne
 * couvrent seuls le besoin du kiosque : payer immédiatement ET être vu en cuisine (voir Readme.md,
 * "quand on est en mode kiosk la commande n'est jamais envoyée en cuisine"). Ce contrôleur crée
 * donc les DEUX dans la même transaction :
 *  - un Ticket, encaissé immédiatement (la preuve de vente réelle, comme TicketController::store) ;
 *  - une Order SANS table, section directement 'ask' (comme SelfOrderController::store en mode
 *    QR) — sert uniquement de support au kitchen display existant, aucun rapport avec le Ticket
 *    au-delà d'avoir été créée dans la même requête. Une fois entièrement 'seed' (préparée et
 *    servie), cette Order n'a plus lieu d'exister — déjà payée — et se supprime automatiquement
 *    (voir OrderSectionController::envoyer).
 */
class KioskOrderController extends Controller
{
    private const TICKET_WITH = ['client', 'sections.lines.product.tax', 'payments.paymentMethod'];

    public function store(Request $request)
    {
        $data = $request->validate([
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'cash_session_id' => ['required', 'integer', 'exists:cash_sessions,id'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
            'payments' => ['required', 'array', 'min:1'],
            'payments.*.payment_method_id' => ['required', 'integer', 'exists:payment_methods,id'],
            'payments.*.value' => ['required', 'numeric', 'min:0.01'],
        ]);

        $cashSession = CashSession::query()->open()->find($data['cash_session_id']);

        if (!$cashSession) {
            throw ValidationException::withMessages([
                'cash_session_id' => ["Aucune session de caisse ouverte. Ouvrez une caisse avant d'encaisser."],
            ]);
        }

        $catalog = ProductCatalog::query()->where('active_self_order', true)->where('active', true)->first();

        if (!$catalog) {
            throw ValidationException::withMessages([
                'lines' => ['Aucun catalogue disponible pour le moment.'],
            ]);
        }

        // Même garde-fou que SelfOrderController::store : ne fait jamais confiance au front pour
        // savoir quels produits sont vraiment self-order.
        $products = $catalog->products()->where('products.active', true)->get()->keyBy('id');

        foreach ($data['lines'] as $line) {
            if (!$products->has($line['product_id'])) {
                throw ValidationException::withMessages([
                    'lines' => ["Un des produits sélectionnés n'est plus disponible."],
                ]);
            }
        }

        $total = 0;
        foreach ($data['lines'] as $line) {
            $total += (float) $products[$line['product_id']]->price * $line['quantity'];
        }

        $paidTotal = collect($data['payments'])->sum('value');

        if (round($paidTotal, 2) !== round($total, 2)) {
            throw ValidationException::withMessages([
                'payments' => ["Le total des paiements ({$paidTotal}) ne correspond pas au montant dû ({$total})."],
            ]);
        }

        [$ticket, $order] = DB::transaction(function () use ($data, $products, $cashSession) {
            $ticket = Ticket::query()->create([
                'paid_at' => now(),
                'client_id' => $data['client_id'] ?? null,
                'source' => 'kiosk',
            ]);

            $ticketSection = TicketSection::query()->create([
                'name' => 'Kiosque',
                'ticket_id' => $ticket->id,
            ]);

            foreach ($data['lines'] as $line) {
                $ticketSection->lines()->create([
                    'quantity' => $line['quantity'],
                    'unit_price' => $products[$line['product_id']]->price,
                    'product_id' => $line['product_id'],
                ]);
            }

            foreach ($data['payments'] as $payment) {
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

            foreach ($data['lines'] as $line) {
                $section->lines()->create([
                    'product_id' => $line['product_id'],
                    'quantity' => $line['quantity'],
                ]);
            }

            return [$ticket, $order];
        });

        event(new OrderKitchenUpdated($order->id));

        return response()->json($ticket->load(self::TICKET_WITH), 201);
    }
}
