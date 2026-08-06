<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\TicketMail;
use App\Models\CashSession;
use App\Models\Product;
use App\Models\Ticket;
use App\Models\TicketPayment;
use App\Models\TicketSection;
use App\Support\DiscountCalculator;
use App\Support\ThermalReceipt;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Throwable;

class TicketController extends Controller
{
    // product.tax nécessaire pour la répartition HT/Taux/TVA/TTC du reçu imprimable (voir
    // core/ticket-print.util.ts côté erp-app, réutilisé par order-builder.ts et ticket-list.ts).
    private const WITH = ['client', 'table', 'sections.lines.product.tax', 'payments.paymentMethod', 'discount'];

    /**
     * Derniers tickets encaissés (dashboard) — ou historique complet ("Gestion des tickets",
     * réimpression uniquement, voir Readme.md : "pas de modification et de suppression").
     * `limit` optionnel (défaut 10) pour ne pas rapatrier tout l'historique par défaut.
     */
    public function index(Request $request)
    {
        $limit = (int) $request->query('limit', 10);

        return Ticket::query()->with(self::WITH)->latest('paid_at')->limit($limit)->get();
    }

    /** Détail d'un ticket ("Gestion des tickets" — voir Readme.md, consultation + réimpression uniquement). */
    public function show(Ticket $ticket)
    {
        return $ticket->load(self::WITH);
    }

    /**
     * Vente directe : encaisse immédiatement (pas de flux Order/cuisine, voir CONTEXT.md).
     * Le prix de chaque ligne est toujours recalculé depuis Product::price côté serveur (jamais
     * fait confiance au front) puis figé dans ticket_lines.unit_price. Paiement multi-moyens :
     * la somme des `payments` doit correspondre exactement au total, sinon 422.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'cash_session_id' => ['required', 'integer', 'exists:cash_sessions,id'],
            'discount_code' => ['nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
            'payments' => ['required', 'array', 'min:1'],
            'payments.*.payment_method_id' => ['required', 'integer', 'exists:payment_methods,id'],
            'payments.*.value' => ['required', 'numeric', 'min:0.01'],
        ]);

        // L'utilisateur qui encaisse est celui qui a ouvert la session de caisse active (le
        // "caissier actif" choisi côté front, voir ActiveCashierService — pas forcément le même
        // que l'utilisateur authentifié sur le poste, plusieurs caissiers pouvant se relayer sur
        // le même poste partagé). Session obligatoire et doit être encore ouverte : un caissier
        // actif périmé côté front (sa session a été fermée entre-temps depuis un autre poste) ne
        // doit pas pouvoir encaisser — voir Readme.md Todo.
        $cashSession = CashSession::query()->open()->find($data['cash_session_id']);

        if (!$cashSession) {
            throw ValidationException::withMessages([
                'cash_session_id' => ["Aucune session de caisse ouverte. Ouvrez une caisse avant d'encaisser."],
            ]);
        }

        $products = Product::query()->whereIn('id', collect($data['lines'])->pluck('product_id'))->get()->keyBy('id');

        $lines = collect($data['lines'])->map(fn (array $line) => [
            'product_id' => $line['product_id'],
            'quantity' => $line['quantity'],
            'unit_price' => (float) $products[$line['product_id']]->price,
        ])->all();

        $total = array_sum(array_map(fn (array $line) => $line['unit_price'] * $line['quantity'], $lines));

        // Réduction recalculée côté serveur (voir DiscountCalculator) — jamais un montant/total
        // envoyé par le client, même principe que les prix produits juste au-dessus.
        $discount = null;
        $discountAmount = 0.0;
        if (!empty($data['discount_code'])) {
            $discount = DiscountCalculator::resolve($data['discount_code']);
            $discountAmount = DiscountCalculator::amountOff($discount, $lines, $total);
            $total = max(round($total - $discountAmount, 2), 0);
        }

        $paidTotal = collect($data['payments'])->sum('value');

        if (round($paidTotal, 2) !== round($total, 2)) {
            throw ValidationException::withMessages([
                'payments' => ["Le total des paiements ({$paidTotal}) ne correspond pas au montant dû ({$total})."],
            ]);
        }

        $ticket = DB::transaction(function () use ($data, $products, $cashSession, $discount, $discountAmount) {
            $ticket = Ticket::query()->create([
                'paid_at' => now(),
                'client_id' => $data['client_id'] ?? null,
                'source' => 'pos_vente_directe',
                'discount_id' => $discount?->id,
                'discount_amount' => $discount ? round($discountAmount, 2) : null,
            ]);

            $section = TicketSection::query()->create([
                'name' => 'Vente directe',
                'ticket_id' => $ticket->id,
            ]);

            foreach ($data['lines'] as $line) {
                $section->lines()->create([
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

            return $ticket;
        });

        return response()->json($ticket->load(self::WITH), 201);
    }

    /**
     * Envoi (ou renvoi) du ticket par email à la demande, depuis la page ticket — plutôt qu'une
     * case à cocher au moment du paiement (UX jugée peu claire : le staff doit pouvoir déclencher
     * l'envoi après coup, pour n'importe quel ticket ayant un client avec email, quel que soit son
     * canal de vente d'origine — restaurant, vente directe, self-order ou kiosque).
     */
    public function sendEmail(Ticket $ticket)
    {
        $ticket->load(self::WITH);

        if (!$ticket->client?->email) {
            throw ValidationException::withMessages([
                'client' => ['Ce ticket n\'a pas de client avec une adresse email.'],
            ]);
        }

        Mail::to($ticket->client->email)->send(new TicketMail($ticket));

        return response()->noContent();
    }

    /**
     * Impression directe sur l'imprimante thermique réseau configurée (voir
     * App\Support\ThermalReceipt / config/printer.php) — en plus de l'impression navigateur
     * existante (window.print() côté front), qui reste utilisable sans aucun matériel.
     */
    public function printThermal(Ticket $ticket)
    {
        $ticket->load(self::WITH);

        try {
            ThermalReceipt::print($ticket);
        } catch (Throwable $e) {
            throw ValidationException::withMessages([
                'printer' => ["Impression impossible : {$e->getMessage()}"],
            ]);
        }

        return response()->noContent();
    }
}
