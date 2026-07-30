<?php

namespace App\Http\Controllers\Api;

use App\Events\OrderKitchenUpdated;
use App\Http\Controllers\Controller;
use App\Mail\TicketMail;
use App\Models\CashSession;
use App\Models\Order;
use App\Models\Ticket;
use App\Models\TicketPayment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

/**
 * POS Restaurant (voir Readme.md) : une Order représente une table ouverte, de l'ouverture au
 * paiement. Tant qu'une Order existe pour une table donnée, cette table est considérée occupée —
 * pas de colonne 'closed'/'paid', une table se libère en supprimant son Order (annulation, voir
 * ::destroy) ou en la payant (voir ::pay, qui la convertit en Ticket puis la supprime).
 */
class OrderController extends Controller
{
    private const WITH = ['table.room', 'client', 'sections.lines.product'];

    public function index()
    {
        return Order::query()->with(self::WITH)->get();
    }

    /**
     * "Ouvrir une table avec le nombre de personnes" — crée aussi sa première section
     * ("Section 1") pour que l'écran de sélection de produits ait toujours au moins une section
     * à afficher, cohérent avec OrderSectionController::destroy qui refuse de vider une commande
     * de sa dernière section.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'table_id' => ['required', 'integer', 'exists:tables,id'],
            'number_of_guests' => ['required', 'integer', 'min:1'],
        ]);

        $occupied = Order::query()->where('table_id', $data['table_id'])->exists();

        if ($occupied) {
            throw ValidationException::withMessages([
                'table_id' => ['Cette table est déjà ouverte.'],
            ]);
        }

        $order = Order::query()->create([
            'table_id' => $data['table_id'],
            'number_of_guests' => $data['number_of_guests'],
            'state' => 'send',
        ]);

        // La section auto-créée ("Section 1") reste 'en_attente' tant qu'elle n'est pas validée —
        // voir Readme.md "on met la section en attente que quand on valide la section et on
        // transfère la section dans kitchen display avec reverb" — donc rien de pertinent pour la
        // CUISINE ici. Mais la table vient de passer d'occupée à libre pour les AUTRES instances
        // de POS - Restaurant (voir Readme.md : "synchroniser les différentes instances de POS -
        // Restaurant quand une table est ouverte ou payée") : table-select.ts écoute ce même
        // canal pour rafraîchir l'occupation des tables en temps réel.
        $order->sections()->create(['name' => 'Section 1']);

        event(new OrderKitchenUpdated($order->id));

        return response()->json($order->load(self::WITH), 201);
    }

    public function show(Order $order)
    {
        return $order->load(self::WITH);
    }

    /**
     * Annule la commande et libère la table — les sections/lignes sont supprimées en cascade
     * (voir migrations order_sections/order_lines, cascadeOnDelete sur order_id/order_section_id).
     */
    public function destroy(Order $order)
    {
        $orderId = $order->id;
        $order->delete();

        event(new OrderKitchenUpdated($orderId));

        return response()->noContent();
    }

    /**
     * "Quand toutes les sections sont envoyées on peut payer" (voir Readme.md, POS - Restaurant
     * étape 4) : refuse (422) tant qu'une section n'est pas 'seed' — même garde-fou recalculé
     * côté serveur (source de vérité), pas seulement désactivé côté front. Paiement multi-moyens
     * (espèces + Bancontact partagés, voir Readme.md étape 5) : même validation "somme des
     * paiements == total" que TicketController::store (vente directe), le prix de chaque ligne
     * étant toujours recalculé depuis Product::price au moment du paiement, jamais fait confiance
     * au front. "Quand une order est payée elle devient un ticket" (étape 6) : les OrderSection
     * deviennent des TicketSection 1:1 (même nom, l'état de la section n'a plus de sens une fois
     * payé donc pas reporté), la commande est ensuite supprimée pour libérer la table (cascade
     * sections/lignes, comme ::destroy). "Envoyer par email si un client est sélectionné" (étape
     * 6) : `send_email` + `client_id` viennent du payload, pas de l'Order (qui n'a jamais de
     * client attaché avant ce moment — sélectionné à l'instant du paiement, même UX que pos-vente).
     */
    public function pay(Request $request, Order $order)
    {
        $data = $request->validate([
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'cash_session_id' => ['nullable', 'integer', 'exists:cash_sessions,id'],
            'send_email' => ['nullable', 'boolean'],
            'payments' => ['required', 'array', 'min:1'],
            'payments.*.payment_method_id' => ['required', 'integer', 'exists:payment_methods,id'],
            'payments.*.value' => ['required', 'numeric', 'min:0.01'],
        ]);

        $order->load('sections.lines.product');

        $sectionNotSent = $order->sections->first(fn ($section) => $section->state !== 'seed');
        if ($sectionNotSent) {
            throw ValidationException::withMessages([
                'state' => ['Toutes les sections doivent être envoyées avant de pouvoir payer.'],
            ]);
        }

        $total = 0;
        foreach ($order->sections as $section) {
            foreach ($section->lines as $line) {
                $total += (float) $line->product->price * $line->quantity;
            }
        }

        $paidTotal = collect($data['payments'])->sum('value');

        if (round($paidTotal, 2) !== round($total, 2)) {
            throw ValidationException::withMessages([
                'payments' => ["Le total des paiements ({$paidTotal}) ne correspond pas au montant dû ({$total})."],
            ]);
        }

        $cashSession = !empty($data['cash_session_id']) ? CashSession::query()->find($data['cash_session_id']) : null;

        $ticket = DB::transaction(function () use ($order, $data, $cashSession) {
            $ticket = Ticket::query()->create([
                'paid_at' => now(),
                'client_id' => $data['client_id'] ?? null,
                'table_id' => $order->table_id,
            ]);

            foreach ($order->sections as $orderSection) {
                $ticketSection = $ticket->sections()->create(['name' => $orderSection->name]);

                foreach ($orderSection->lines as $orderLine) {
                    $ticketSection->lines()->create([
                        'quantity' => $orderLine->quantity,
                        'unit_price' => $orderLine->product->price,
                        'product_id' => $orderLine->product_id,
                    ]);
                }
            }

            foreach ($data['payments'] as $payment) {
                TicketPayment::query()->create([
                    'value' => $payment['value'],
                    'payment_method_id' => $payment['payment_method_id'],
                    'ticket_id' => $ticket->id,
                    'user_id' => $cashSession?->user_id,
                    'cash_session_id' => $cashSession?->id,
                ]);
            }

            $order->delete();

            return $ticket;
        });

        event(new OrderKitchenUpdated($order->id));

        $ticket->load(['client', 'table', 'sections.lines.product.tax', 'payments.paymentMethod']);

        if (($data['send_email'] ?? false) && $ticket->client?->email) {
            Mail::to($ticket->client->email)->send(new TicketMail($ticket));
        }

        return response()->json($ticket, 201);
    }
}
