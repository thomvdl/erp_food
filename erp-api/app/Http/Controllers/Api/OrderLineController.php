<?php

namespace App\Http\Controllers\Api;

use App\Events\OrderKitchenUpdated;
use App\Http\Controllers\Controller;
use App\Models\OrderLine;
use App\Models\OrderSection;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class OrderLineController extends Controller
{
    /**
     * Ajoute un produit à la section — si ce produit y est déjà avec la même note (y compris
     * "pas de note" pour les deux), incrémente la quantité au lieu de dupliquer la ligne (même
     * logique que le panier du POS Vente directe côté front). Deux lignes du même produit avec
     * des notes différentes (ex. "bien cuit" / "saignant") restent volontairement deux lignes
     * distinctes — les fusionner écraserait silencieusement l'une des deux notes.
     *
     * Un combo (Product::is_combo) n'est PAS ajouté comme une ligne opaque : il est éclaté en une
     * OrderLine PAR COMPOSANT (voir addCombo()) — chaque poste de préparation ne voit et ne
     * marque alors que sa propre ligne, sans affecter les composants des autres postes du même
     * combo (voir Readme.md/CONTEXT.md pour le bug que ça corrige : "marquer prêt" dans une
     * station marquait aussi les composants d'une autre station).
     *
     * Diffuse la mise à jour (voir Readme.md : "à chaque ajout de produit, tout synchroniser") —
     * une section 'en_attente' n'intéresse pas la cuisine, mais une autre instance de
     * POS - Restaurant sur la même commande (ex. un second serveur) doit voir le panier à jour.
     */
    public function store(Request $request, OrderSection $orderSection)
    {
        $this->assertEditable($orderSection);

        $data = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'quantity' => ['nullable', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $quantity = $data['quantity'] ?? 1;
        $product = Product::query()->with('components')->findOrFail($data['product_id']);

        if ($product->is_combo) {
            $lines = $this->addCombo($orderSection, $product, $quantity);
        } else {
            $note = $data['note'] ?? null;
            $line = $orderSection->lines()->where('product_id', $product->id)->where('note', $note)->first();

            if ($line) {
                $line->increment('quantity', $quantity);
            } else {
                $line = $orderSection->lines()->create(['product_id' => $product->id, 'quantity' => $quantity, 'note' => $note]);
            }
            $lines = [$line];
        }

        event(new OrderKitchenUpdated($orderSection->order_id));

        return response()->json(collect($lines)->map->load('product'), 201);
    }

    /**
     * Une ligne par composant, taguée `combo_id` + une note reprenant le nom du combo ("Menu
     * Burger") pour garder le contexte visible en cuisine/au panier SANS écran supplémentaire —
     * réutilise l'affichage de note déjà existant (voir kitchen-card__line-note). Si ce même
     * combo a déjà des lignes dans cette section (on en recommande un), leurs quantités sont
     * incrémentées au prorata plutôt que de dupliquer les lignes (même esprit que le merge
     * product_id+note ci-dessus, mais matché sur product_id+combo_id : la note est déterministe
     * pour un combo, pas besoin de la comparer).
     *
     * @return array<int, OrderLine>
     */
    private function addCombo(OrderSection $orderSection, Product $combo, int $quantity): array
    {
        $lines = [];

        foreach ($combo->components as $component) {
            $addQuantity = $quantity * $component->pivot->quantity;

            $line = $orderSection->lines()
                ->where('product_id', $component->id)
                ->where('combo_id', $combo->id)
                ->first();

            if ($line) {
                $line->increment('quantity', $addQuantity);
            } else {
                $line = $orderSection->lines()->create([
                    'product_id' => $component->id,
                    'combo_id' => $combo->id,
                    'quantity' => $addQuantity,
                    'note' => $combo->name,
                ]);
            }

            $lines[] = $line;
        }

        return $lines;
    }

    /**
     * `quantity`/`note` sont tous deux "sometimes" : le front envoie l'un ou l'autre séparément
     * (incrémentation de quantité vs édition de la note), jamais les deux à la fois — voir
     * order-line.service.ts (updateQuantity/updateNote). Un champ absent du payload reste
     * inchangé plutôt que d'être écrasé.
     */
    public function update(Request $request, OrderLine $orderLine)
    {
        $this->assertEditable($orderLine->orderSection);

        $data = $request->validate([
            'quantity' => ['sometimes', 'integer', 'min:1'],
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        if (empty($data)) {
            throw ValidationException::withMessages([
                'quantity' => ['Rien à mettre à jour.'],
            ]);
        }

        $orderLine->update($data);

        event(new OrderKitchenUpdated($orderLine->orderSection->order_id));

        return $orderLine->load('product');
    }

    public function destroy(OrderLine $orderLine)
    {
        $this->assertEditable($orderLine->orderSection);

        $orderId = $orderLine->orderSection->order_id;
        $orderLine->delete();

        event(new OrderKitchenUpdated($orderId));

        return response()->noContent();
    }

    /**
     * Une section "demandée" (ou déjà "faite") est partie en cuisine — la modifier silencieusement
     * après coup désynchroniserait ce que la cuisine prépare de ce qui est réellement commandé.
     * Pour ajouter des articles après avoir demandé une section, il faut ouvrir une nouvelle
     * section (voir OrderSectionController::store).
     */
    private function assertEditable(OrderSection $orderSection): void
    {
        if ($orderSection->state !== 'en_attente') {
            throw ValidationException::withMessages([
                'state' => ['Cette section a déjà été envoyée en cuisine, elle ne peut plus être modifiée.'],
            ]);
        }
    }
}
