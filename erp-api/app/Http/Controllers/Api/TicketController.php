<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\TicketMail;
use App\Models\CashSession;
use App\Models\Client;
use App\Models\Product;
use App\Models\Ticket;
use App\Models\TicketPayment;
use App\Models\TicketSection;
use App\Support\DiscountCalculator;
use App\Support\LoyaltyPoints;
use App\Support\MenuResolver;
use App\Support\StockManager;
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
            'points_redeemed' => ['nullable', 'integer', 'min:1'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
            // Personnalisation libre (ex. "Sans oignon", voir Product::ingredients côté modale
            // panier) — jamais validée contre la vraie liste d'ingrédients du produit, comme le
            // reste des notes déjà en place (voir OrderLineController::store).
            'lines.*.note' => ['nullable', 'string', 'max:255'],
            // Requis uniquement si le produit est un menu (is_menu) — voir App\Support\MenuResolver.
            'lines.*.menu_choices' => ['array'],
            'lines.*.menu_choices.*.menu_group_id' => ['integer'],
            'lines.*.menu_choices.*.product_ids' => ['array'],
            'lines.*.menu_choices.*.product_ids.*' => ['integer'],
            'lines.*.menu_choices.*.product_notes' => ['array'],
            'lines.*.menu_choices.*.product_notes.*.product_id' => ['integer'],
            'lines.*.menu_choices.*.product_notes.*.note' => ['nullable', 'string', 'max:255'],
            'payments' => ['required', 'array', 'min:1'],
            'payments.*.payment_method_id' => ['required', 'integer', 'exists:payment_methods,id'],
            'payments.*.value' => ['required', 'numeric', 'min:0.01'],
        ]);

        $client = isset($data['client_id']) ? Client::find($data['client_id']) : null;

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

        // Un menu (is_menu) s'éclate en plusieurs ticket_lines : une par produit choisi
        // (unit_price=0, note=nom du menu) plus une ligne "porteuse" (product_id = le menu
        // lui-même, prix réel du menu) qui porte le montant réellement dû — comme un produit
        // normal, aucun calcul spécial nécessaire pour elle. Voir App\Support\MenuResolver::expandLines.
        $lines = MenuResolver::expandLines($data['lines'], $products);

        $total = array_sum(array_map(fn (array $line) => $line['unit_price'] * $line['quantity'], $lines));

        // Réduction recalculée côté serveur (voir DiscountCalculator) — jamais un montant/total
        // envoyé par le client, même principe que les prix produits juste au-dessus. Réservé à
        // superviseur+ (voir Readme.md, "il n'y aura que trois rôles") : un simple user peut
        // vendre/encaisser mais pas appliquer de code promo.
        $discount = null;
        $discountAmount = 0.0;
        if (!empty($data['discount_code'])) {
            abort_unless($request->user()->isAtLeastSuperviseur(), 403, "Seul un superviseur peut appliquer un code de réduction.");
            $discount = DiscountCalculator::resolve($data['discount_code']);
            $discountAmount = DiscountCalculator::amountOff($discount, $lines, $total);
            $total = max(round($total - $discountAmount, 2), 0);
        }

        // Réduction en points fidélité (voir App\Support\LoyaltyPoints) — cumulable avec un code
        // promo (appliqué juste au-dessus), ouvert à tout rôle authentifié contrairement aux codes
        // promo (voir docblock de la classe).
        $pointsRedeemed = $data['points_redeemed'] ?? 0;
        $pointsRedeemedAmount = 0.0;
        if ($pointsRedeemed > 0) {
            $pointsRedeemedAmount = LoyaltyPoints::amountOff($pointsRedeemed, $client, $total);
            $total = max(round($total - $pointsRedeemedAmount, 2), 0);
        }

        $paidTotal = collect($data['payments'])->sum('value');

        if (round($paidTotal, 2) !== round($total, 2)) {
            throw ValidationException::withMessages([
                'payments' => ["Le total des paiements ({$paidTotal}) ne correspond pas au montant dû ({$total})."],
            ]);
        }

        $ticket = DB::transaction(function () use ($data, $lines, $cashSession, $discount, $discountAmount, $client, $pointsRedeemed, $pointsRedeemedAmount, $total) {
            // Voir App\Support\StockManager — rejette (422) si un produit à stock suivi n'a plus
            // assez d'unités, avant toute écriture.
            StockManager::consume($lines);

            // Gagnés sur le montant net final (après promo ET points) — jamais de gain sur la
            // part payée en points (voir App\Support\LoyaltyPoints::earned).
            $pointsEarned = $client ? LoyaltyPoints::earned($total) : 0;

            $ticket = Ticket::query()->create([
                'paid_at' => now(),
                'client_id' => $data['client_id'] ?? null,
                'source' => 'pos_vente_directe',
                'discount_id' => $discount?->id,
                'discount_amount' => $discount ? round($discountAmount, 2) : null,
                'points_earned' => $client ? $pointsEarned : null,
                'points_redeemed' => $pointsRedeemed > 0 ? $pointsRedeemed : null,
                'points_redeemed_amount' => $pointsRedeemed > 0 ? round($pointsRedeemedAmount, 2) : null,
            ]);

            $section = TicketSection::query()->create([
                'name' => 'Vente directe',
                'ticket_id' => $ticket->id,
            ]);

            foreach ($lines as $line) {
                $section->lines()->create([
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'product_id' => $line['product_id'],
                    'note' => $line['note'] ?? null,
                    'menu_id' => $line['menu_id'] ?? null,
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

            if ($client) {
                LoyaltyPoints::apply($client, $pointsEarned, $pointsRedeemed, $ticket->id);
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
