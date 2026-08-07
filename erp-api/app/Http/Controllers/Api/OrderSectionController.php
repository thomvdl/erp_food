<?php

namespace App\Http\Controllers\Api;

use App\Events\OrderKitchenUpdated;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderSection;
use App\Support\StockManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * "Séparer les produits en sections, pouvoir ajouter des sections (section 1, section 2, ...)"
 * (voir Readme.md).
 */
class OrderSectionController extends Controller
{
    /**
     * "On peut ajouter une section que si la précédente contient au moins un article" (voir
     * Readme.md) — évite d'accumuler des sections vides sans jamais les remplir.
     */
    public function store(Request $request, Order $order)
    {
        $data = $request->validate(['name' => ['nullable', 'string', 'max:255']]);

        $lastSection = $order->sections()->latest('id')->first();

        if ($lastSection && $lastSection->lines()->doesntExist()) {
            throw ValidationException::withMessages([
                'name' => ['Ajoute au moins un article à la section précédente avant d\'en créer une nouvelle.'],
            ]);
        }

        $nextNumber = $order->sections()->count() + 1;
        $section = $order->sections()->create(['name' => $data['name'] ?? "Section {$nextNumber}"]);

        event(new OrderKitchenUpdated($order->id));

        return response()->json($section->load('lines.product'), 201);
    }

    /**
     * "On ne peut supprimer une section que si elle est vide" (voir Readme.md), et refuse en plus
     * de supprimer la dernière section d'une commande — une commande sans section n'a nulle part
     * où accrocher un produit (voir OrderController::store qui en crée toujours une à
     * l'ouverture d'une table).
     */
    public function destroy(OrderSection $orderSection)
    {
        if ($orderSection->lines()->exists()) {
            throw ValidationException::withMessages([
                'name' => ['Vide la section avant de la supprimer.'],
            ]);
        }

        if ($orderSection->order->sections()->count() <= 1) {
            throw ValidationException::withMessages([
                'name' => ['Une commande doit garder au moins une section.'],
            ]);
        }

        $orderId = $orderSection->order_id;
        $orderSection->delete();

        event(new OrderKitchenUpdated($orderId));

        return response()->noContent();
    }

    /**
     * Cycle d'une section (voir Readme.md : "donc la order section (Send -> Ask -> Do -> Seed ->
     * Done)" — mêmes noms que orders.state, volontairement) :
     *   en_attente (défaut, en cours de composition, pas encore sur le kitchen display)
     *   --[valider]--> send (verrouillée, visible sur le kitchen display, pas encore appelée)
     *   --[demander en cuisine]--> ask (appelée, les postes doivent la préparer)
     *   --[marquer faite]--> do (le poste correspondant l'a préparée)
     *   --[envoyer]--> seed (le passe correspondant l'a expédiée) ; 'done' reste non atteint par
     *   cette implémentation, comme pour orders.state (voir CONTEXT.md).
     * 'valider' et 'demander en cuisine' sont deux actions distinctes (confirmé par l'utilisateur
     * après une version précédente qui les avait fusionnées en un seul bouton).
     */

    /**
     * "Valider" (voir Readme.md) : verrouille la section (plus modifiable, voir
     * OrderLineController::assertEditable) et l'envoie sur le kitchen display — mais ne la met
     * pas encore dans la file d'attente active des postes, voir ::demander pour ça.
     *
     * Voir App\Support\StockManager : c'est ICI, pas au paiement final (qui peut arriver bien
     * plus tard), que le stock des produits suivis est vérifié PUIS décrémenté — une fois validée
     * la section part en cuisine, c'est le vrai moment de consommation physique. `stock_consumed`
     * posé dans la même transaction évite qu'OrderController::pay() ne décrémente une seconde
     * fois cette section au paiement.
     */
    public function valider(OrderSection $orderSection)
    {
        if ($orderSection->state !== 'en_attente') {
            throw ValidationException::withMessages([
                'state' => ['Cette section a déjà été validée.'],
            ]);
        }

        $orderSection->load('lines');

        if ($orderSection->lines->isEmpty()) {
            throw ValidationException::withMessages([
                'state' => ['Ajoute au moins un article avant de valider cette section.'],
            ]);
        }

        DB::transaction(function () use ($orderSection) {
            StockManager::consume(
                $orderSection->lines->map(fn ($line) => ['product_id' => $line->product_id, 'quantity' => $line->quantity])->all(),
            );

            $orderSection->forceFill(['state' => 'send', 'stock_consumed' => true])->save();
        });

        event(new OrderKitchenUpdated($orderSection->order_id));

        return $orderSection->load('lines.product');
    }

    /**
     * "Demander en cuisine" (voir Readme.md) : la section validée passe en file d'attente active
     * pour les postes. Fait passer la commande de 'send' à 'ask' dès la première section demandée.
     */
    public function demander(OrderSection $orderSection)
    {
        if ($orderSection->state !== 'send') {
            throw ValidationException::withMessages([
                'state' => ['Cette section doit d\'abord être validée.'],
            ]);
        }

        $orderSection->update(['state' => 'ask', 'asked_at' => now()]);

        $order = $orderSection->order;
        if ($order->state === 'send') {
            $order->update(['state' => 'ask']);
        }

        event(new OrderKitchenUpdated($order->id));

        return $orderSection->load('lines.product');
    }

    /**
     * "Fait" (voir Readme.md) : le poste correspondant au produit marque la section comme
     * préparée — mais "quand il y a une table avec plusieurs produits, uniquement les produits de
     * son propre poste et de son propre passe [doivent être concernés] ; là quand on marque comme
     * fait, ça le fait pour tous les produits de la section" (retour utilisateur) : une section
     * peut mélanger des produits de plusieurs stations, donc cet endpoint marque désormais des
     * LIGNES précises (`line_ids`, voir erp_kitchen_display qui n'envoie que les lignes
     * effectivement visibles dans le poste/passe filtré), pas la section entière. Sans
     * `line_ids` (vue "Tout"), marque toutes les lignes — comportement d'avant, toujours valide
     * pour une section mono-poste. La section elle-même ne passe à 'do' (et la commande de 'ask'
     * à 'do' si applicable) qu'une fois TOUTES ses lignes marquées faites, pas juste celles visées
     * par cet appel.
     */
    public function marquerFait(Request $request, OrderSection $orderSection)
    {
        if ($orderSection->state !== 'ask') {
            throw ValidationException::withMessages([
                'state' => ['Cette section doit d\'abord être demandée en cuisine.'],
            ]);
        }

        $data = $request->validate([
            'line_ids' => ['nullable', 'array'],
            'line_ids.*' => ['integer', 'exists:order_lines,id'],
        ]);

        $lines = isset($data['line_ids'])
            ? $orderSection->lines()->whereIn('id', $data['line_ids'])->get()
            : $orderSection->lines;

        foreach ($lines as $line) {
            $line->forceFill(['done' => true])->save();
        }

        $sectionFullyDone = $orderSection->lines()->where('done', false)->doesntExist();
        if ($sectionFullyDone) {
            $orderSection->update(['state' => 'do']);
        }

        $order = $orderSection->order;
        $allAtLeastDo = $order->sections()->whereNotIn('state', ['do', 'seed'])->doesntExist();
        if ($allAtLeastDo && $order->state === 'ask') {
            $order->update(['state' => 'do']);
        }

        event(new OrderKitchenUpdated($order->id));

        return $orderSection->load('lines.product');
    }

    /**
     * "Envoyer" (voir Readme.md) : le passe correspondant marque la section comme expédiée —
     * section par section, sans attendre les autres sections de la même commande (voir
     * CONTEXT.md). "Pour les passes aussi, quand je valide dans un passe ça valide dans les deux
     * pour la même table et la même section" (retour utilisateur) : une section peut avoir des
     * lignes réparties sur deux passes différents (stations différentes, voir
     * `stations.passe_id`) — comme pour ::marquerFait, cet endpoint marque désormais des LIGNES
     * précises (`line_ids`, envoyées par erp_kitchen_display selon le passe filtré), pas la
     * section entière. Sans `line_ids` (vue "Tout"), marque toutes les lignes. La section ne
     * passe à 'seed' que lorsque TOUTES ses lignes sont envoyées, pas juste celles visées par cet
     * appel. Une fois TOUTES les sections d'une commande envoyées, la commande elle-même passe à
     * 'seed' et disparaît du kitchen display.
     */
    public function envoyer(Request $request, OrderSection $orderSection)
    {
        if ($orderSection->state !== 'do') {
            throw ValidationException::withMessages([
                'state' => ['Cette section doit d\'abord être marquée comme faite.'],
            ]);
        }

        $data = $request->validate([
            'line_ids' => ['nullable', 'array'],
            'line_ids.*' => ['integer', 'exists:order_lines,id'],
        ]);

        $lines = isset($data['line_ids'])
            ? $orderSection->lines()->whereIn('id', $data['line_ids'])->get()
            : $orderSection->lines;

        foreach ($lines as $line) {
            $line->forceFill(['sent' => true])->save();
        }

        $sectionFullySent = $orderSection->lines()->where('sent', false)->doesntExist();
        if ($sectionFullySent) {
            $orderSection->update(['state' => 'seed']);
        }

        $order = $orderSection->order;
        $allSent = $order->sections()->where('state', '!=', 'seed')->doesntExist();
        if ($allSent) {
            $order->update(['state' => 'seed']);

            // Commande kiosque (voir KioskOrderController — Order sans table, déjà payée via un
            // Ticket créé à part au moment de la commande) : une fois entièrement préparée et
            // servie, cette Order n'a plus lieu d'exister, contrairement à une table qui reste
            // ouverte jusqu'à l'encaissement (voir OrderController::pay, qui la supprime lui-même
            // à ce moment-là). On la supprime donc ici à sa place.
            if ($order->table_id === null) {
                $orderId = $order->id;
                $order->delete();

                event(new OrderKitchenUpdated($orderId));

                return response()->json(['deleted' => true]);
            }
        }

        event(new OrderKitchenUpdated($order->id));

        return $orderSection->load('lines.product');
    }
}
