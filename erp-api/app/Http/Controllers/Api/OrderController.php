<?php

namespace App\Http\Controllers\Api;

use App\Events\OrderKitchenUpdated;
use App\Http\Controllers\Controller;
use App\Models\CashSession;
use App\Models\Client;
use App\Models\Order;
use App\Models\Ticket;
use App\Models\TicketPayment;
use App\Support\DiscountCalculator;
use App\Support\LoyaltyPoints;
use App\Support\StockManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
            'source' => 'pos_restaurant',
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
     * "Le client change de table" — déplace la commande (panier, sections, tout) vers une autre
     * table, sans rien perdre. La table cible doit être libre, même contrôle qu'à l'ouverture
     * (::store) — revérifié ici plutôt que fait confiance au front, `table_id` n'a pas de
     * contrainte unique en base (voir migration create_orders_table), donc rien n'empêche une
     * race entre deux postes qui transféreraient vers la même table cible en même temps.
     */
    public function transfer(Request $request, Order $order)
    {
        $data = $request->validate([
            'table_id' => ['required', 'integer', 'exists:tables,id'],
        ]);

        if ((int) $data['table_id'] === $order->table_id) {
            throw ValidationException::withMessages([
                'table_id' => ['La commande est déjà sur cette table.'],
            ]);
        }

        $occupied = Order::query()->where('table_id', $data['table_id'])->exists();

        if ($occupied) {
            throw ValidationException::withMessages([
                'table_id' => ['Cette table est déjà ouverte.'],
            ]);
        }

        $order->update(['table_id' => $data['table_id']]);

        event(new OrderKitchenUpdated($order->id));

        return $order->load(self::WITH);
    }

    /**
     * Annule la commande et libère la table — les sections/lignes sont supprimées en cascade
     * (voir migrations order_sections/order_lines, cascadeOnDelete sur order_id/order_section_id).
     *
     * Voir App\Support\StockManager : une section déjà validée (`stock_consumed`, voir
     * OrderSectionController::valider()) a déjà décrémenté son stock — l'annuler sans rien
     * redonner perdrait ce stock pour de bon. Lignes de correction exclues du calcul (elles ne
     * correspondent à aucun décrément d'origine, voir ::correction) : seules les lignes
     * d'origine, telles que décrémentées à la validation, sont restituées.
     */
    public function destroy(Order $order)
    {
        $orderId = $order->id;

        $order->load('sections.lines');

        $stockLines = [];
        foreach ($order->sections as $section) {
            if (!$section->stock_consumed) {
                continue;
            }
            foreach ($section->lines as $line) {
                if ($line->is_correction) {
                    continue;
                }
                $stockLines[] = ['product_id' => $line->product_id, 'quantity' => $line->quantity];
            }
        }

        DB::transaction(function () use ($order, $stockLines) {
            StockManager::restore($stockLines);
            $order->delete();
        });

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
     * sections/lignes, comme ::destroy). `client_id` vient du payload, pas de l'Order (qui n'a
     * jamais de client attaché avant ce moment — sélectionné à l'instant du paiement, même UX que
     * pos-vente). L'envoi du ticket par email, lui, se fait après coup depuis la page ticket (voir
     * TicketController::sendEmail), pas ici.
     */
    public function pay(Request $request, Order $order)
    {
        $data = $request->validate([
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'cash_session_id' => ['required', 'integer', 'exists:cash_sessions,id'],
            'discount_code' => ['nullable', 'string'],
            'points_redeemed' => ['nullable', 'integer', 'min:1'],
            'payments' => ['required', 'array', 'min:1'],
            'payments.*.payment_method_id' => ['required', 'integer', 'exists:payment_methods,id'],
            'payments.*.value' => ['required', 'numeric', 'min:0.01'],
        ]);

        $client = isset($data['client_id']) ? Client::find($data['client_id']) : null;

        // Session obligatoire et doit être encore ouverte — voir TicketController::store (même
        // règle, voir Readme.md Todo "pas de paiement possible sans caisse ouverte").
        $cashSession = CashSession::query()->open()->find($data['cash_session_id']);

        if (!$cashSession) {
            throw ValidationException::withMessages([
                'cash_session_id' => ["Aucune session de caisse ouverte. Ouvrez une caisse avant d'encaisser."],
            ]);
        }

        $order->load('sections.lines.product');

        $sectionNotSent = $order->sections->first(fn ($section) => $section->state !== 'seed');
        if ($sectionNotSent) {
            throw ValidationException::withMessages([
                'state' => ['Toutes les sections doivent être envoyées avant de pouvoir payer.'],
            ]);
        }

        // Lignes réellement facturables (product.price * quantity) — exclut les lignes composants
        // d'un menu (order_lines.priced = false, voir App\Support\MenuResolver) : leur prix est
        // déjà porté par la ligne "porteuse" du menu (product_id = le menu lui-même, priced=true,
        // une ligne normale comme les autres). Sans ce filtre, un menu à prix fixe facturerait le
        // menu ET la somme de ses composants. Les combos, eux, restent inchangés (priced=true par
        // défaut) : chaque composant garde son propre prix, comme aujourd'hui.
        $lines = [];
        // Sous-ensemble de $lines dont le stock n'a PAS déjà été décrémenté plus tôt — voir
        // order_sections.stock_consumed, posé par OrderSectionController::valider() (POS
        // Restaurant, à la validation) et par SelfOrderController::store() (self-order, à la
        // soumission). Ne reste ici que les tables déjà ouvertes avant l'introduction de cette
        // colonne — filet de sécurité, pas un chemin normal une fois toutes en circulation.
        // Contrairement à $lines (filtré priced=true), on décrémente le stock de TOUTES les
        // lignes (composants inclus) : ce sont les vrais produits physiquement servis.
        $stockLines = [];
        foreach ($order->sections as $section) {
            foreach ($section->lines as $line) {
                $lineData = [
                    'product_id' => $line->product_id,
                    // Une ligne de correction (voir ::correction) reste stockée avec une quantity
                    // POSITIVE en base (colonne unsignedInteger, jamais de quantité négative
                    // persistée) — c'est ICI, au moment de calculer le total réellement dû, que son
                    // effet est inversé.
                    'quantity' => $line->is_correction ? -$line->quantity : $line->quantity,
                    'unit_price' => (float) $line->product->price,
                ];

                if ($line->priced) {
                    $lines[] = $lineData;
                }

                if (!$section->stock_consumed) {
                    $stockLines[] = $lineData;
                }
            }
        }

        $total = array_sum(array_map(fn (array $line) => $line['unit_price'] * $line['quantity'], $lines));

        // Réduction recalculée côté serveur (voir DiscountCalculator) — même principe que
        // TicketController::store : jamais un montant/total envoyé par le client. C'est aussi le
        // point d'entrée pour une réduction sur une commande composée en self-order (voir
        // SelfOrderController, qui ne gère aucun paiement) puisque c'est ICI, à l'encaissement
        // réel par le staff, que le code est appliqué. Réservé à superviseur+ (voir Readme.md).
        $discount = null;
        $discountAmount = 0.0;
        if (!empty($data['discount_code'])) {
            abort_unless($request->user()->isAtLeastSuperviseur(), 403, "Seul un superviseur peut appliquer un code de réduction.");
            $discount = DiscountCalculator::resolve($data['discount_code']);
            $discountAmount = DiscountCalculator::amountOff($discount, $lines, $total);
            $total = max(round($total - $discountAmount, 2), 0);
        }

        // Réduction en points fidélité (voir App\Support\LoyaltyPoints) — même emplacement/logique
        // que TicketController::store, cumulable avec le code promo appliqué juste au-dessus.
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

        $ticket = DB::transaction(function () use ($order, $data, $stockLines, $cashSession, $discount, $discountAmount, $client, $pointsRedeemed, $pointsRedeemedAmount, $total) {
            // Voir App\Support\StockManager — ne décrémente QUE les sections pas encore
            // consommées (voir $stockLines plus haut), la quasi-totalité l'ont déjà été à la
            // validation (POS Restaurant) ou à la soumission (self-order). $stockLines porte déjà
            // le signe des lignes de correction (voir plus haut), une correction ne redonne donc
            // jamais plus de stock que ce qui a été décrémenté sur ce même paiement.
            StockManager::consume($stockLines);

            // Gagnés sur le montant net final (après promo ET points) — voir TicketController::store.
            $pointsEarned = $client ? LoyaltyPoints::earned($total) : 0;

            $ticket = Ticket::query()->create([
                'paid_at' => now(),
                'client_id' => $data['client_id'] ?? null,
                'table_id' => $order->table_id,
                // Recopié depuis l'Order plutôt que fixé à 'pos_restaurant' en dur : une table
                // peut avoir été ouverte par le personnel OU par un client via QR (voir
                // SelfOrderController::store), ce ticket doit refléter l'origine réelle.
                'source' => $order->source,
                'discount_id' => $discount?->id,
                'discount_amount' => $discount ? round($discountAmount, 2) : null,
                'points_earned' => $client ? $pointsEarned : null,
                'points_redeemed' => $pointsRedeemed > 0 ? $pointsRedeemed : null,
                'points_redeemed_amount' => $pointsRedeemed > 0 ? round($pointsRedeemedAmount, 2) : null,
            ]);

            foreach ($order->sections as $orderSection) {
                $ticketSection = $ticket->sections()->create(['name' => $orderSection->name]);

                foreach ($orderSection->lines as $orderLine) {
                    $ticketSection->lines()->create([
                        'quantity' => $orderLine->quantity,
                        'note' => $orderLine->note,
                        'is_correction' => $orderLine->is_correction,
                        // priced=false (composant d'un menu, voir App\Support\MenuResolver) : son
                        // prix est déjà porté par la ligne "porteuse" du menu (priced=true) —
                        // sinon le reçu facturerait le menu ET la somme de ses composants, même
                        // bug que celui déjà corrigé sur le calcul de $total plus haut.
                        'unit_price' => $orderLine->priced ? $orderLine->product->price : 0,
                        'product_id' => $orderLine->product_id,
                        'menu_id' => $orderLine->menu_id,
                    ]);
                }
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

            $order->delete();

            return $ticket;
        });

        event(new OrderKitchenUpdated($order->id));

        return response()->json($ticket->load(['client', 'table', 'sections.lines.product.tax', 'payments.paymentMethod', 'discount']), 201);
    }

    /**
     * "Corriger une commande si il y a un produit en trop" (retour utilisateur) : une fois une
     * section envoyée en cuisine (state 'seed'), OrderLineController::assertEditable interdit
     * d'en modifier/supprimer les lignes — ce qui est correct pour ne jamais désynchroniser ce
     * que la cuisine a réellement préparé, mais laisse le vendeur sans recours pour corriger
     * l'addition si un produit a été rentré en trop. Plutôt que de supprimer la ligne d'origine
     * (perdrait la trace de ce qui a été demandé en cuisine), cette action ajoute une NOUVELLE
     * ligne du même produit, flaguée `is_correction` — son montant est déduit du total (voir
     * ::pay ci-dessus et order-builder.ts::lineTotal), jamais renvoyée en cuisine
     * (`done`/`sent` forcés à true, et de toute façon exclue du kitchen display qui ignore déjà
     * les sections 'seed', voir kitchen-board.ts).
     *
     * Autorisé seulement une fois TOUTES les sections envoyées ('seed', même garde-fou que
     * ::pay) — avant ça, une section encore éditable peut simplement voir sa ligne
     * décrémentée/supprimée normalement, et une section déjà 'ask'/'do' mais pas encore 'seed'
     * resterait visible sur le kitchen display, où une ligne de correction n'aurait pas de sens
     * (rien à préparer).
     *
     * Une même produit peut apparaître dans plusieurs sections (deux tournées de commande) : la
     * quantité demandée est décomptée section par section, dans l'ordre, jusqu'à épuisement —
     * refuse (422) si la quantité totale demandée dépasse ce qui a réellement été commandé.
     */
    public function correction(Request $request, Order $order)
    {
        $data = $request->validate([
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
        ]);

        $order->load('sections.lines');

        $sectionNotSent = $order->sections->first(fn ($section) => $section->state !== 'seed');
        if ($sectionNotSent) {
            throw ValidationException::withMessages([
                'state' => ['Toutes les sections doivent être envoyées en cuisine avant de pouvoir corriger la commande.'],
            ]);
        }

        $createdLines = [];

        DB::transaction(function () use ($order, $data, &$createdLines) {
            foreach ($data['lines'] as $requested) {
                $remaining = $requested['quantity'];

                foreach ($order->sections as $section) {
                    if ($remaining <= 0) {
                        break;
                    }

                    // ->where('priced', true) : une ligne composant d'un menu (voir
                    // App\Support\MenuResolver, priced=false) n'a jamais été facturée
                    // séparément — la corriger déduirait à tort son prix du total, alors que ce
                    // produit n'y contribue pas. Seules les vraies lignes facturées (dont la
                    // ligne "porteuse" du menu lui-même) sont corrigibles.
                    $net = $section->lines->where('product_id', $requested['product_id'])->where('priced', true)
                        ->sum(fn ($line) => $line->is_correction ? -$line->quantity : $line->quantity);

                    if ($net <= 0) {
                        continue;
                    }

                    $take = min($net, $remaining);

                    $line = $section->lines()->create([
                        'product_id' => $requested['product_id'],
                        'quantity' => $take,
                    ]);
                    $line->forceFill(['is_correction' => true, 'done' => true, 'sent' => true])->save();

                    $createdLines[] = $line;
                    $remaining -= $take;
                }

                if ($remaining > 0) {
                    $corrected = $requested['quantity'] - $remaining;
                    throw ValidationException::withMessages([
                        'lines' => ["Impossible de corriger {$requested['quantity']} unité(s) de ce produit — seulement {$corrected} présente(s) dans la commande."],
                    ]);
                }
            }
        });

        event(new OrderKitchenUpdated($order->id));

        return response()->json(collect($createdLines)->map->load('product'), 201);
    }

    /**
     * Cycle de vie dédié aux commandes boutique en ligne "à livrer" (voir migration
     * add_delivery_status_to_orders_table) — consommé par erp-app > Gestion > Livraison. Ces
     * commandes ne passent jamais par le Kitchen Display (voir erp_kitchen_display >
     * kitchen-board.ts, qui les exclut sur delivery_address), donc rien d'autre ne fait jamais
     * progresser/nettoyer cette Order : pending -> out_for_delivery -> delivered, ce dernier
     * palier supprimant l'Order (déjà payée via son Ticket, même principe que
     * OrderSectionController::envoyer pour une commande kiosque entièrement servie).
     */
    public function updateDeliveryStatus(Request $request, Order $order)
    {
        abort_unless($order->fulfillment_type === 'delivery', 422, "Cette commande n'est pas une livraison.");

        $data = $request->validate([
            'status' => ['required', 'string', 'in:pending,out_for_delivery,delivered'],
        ]);

        if ($data['status'] === 'delivered') {
            $orderId = $order->id;
            $order->delete();

            event(new OrderKitchenUpdated($orderId));

            return response()->json(['deleted' => true]);
        }

        $order->update(['delivery_status' => $data['status']]);

        event(new OrderKitchenUpdated($order->id));

        return $order->load(self::WITH);
    }
}
