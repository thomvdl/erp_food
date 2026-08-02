<?php

namespace App\Http\Controllers\Api;

use App\Events\OrderKitchenUpdated;
use App\Http\Controllers\Controller;
use App\Models\OrderLine;
use App\Models\OrderSection;
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
        $note = $data['note'] ?? null;

        $line = $orderSection->lines()->where('product_id', $data['product_id'])->where('note', $note)->first();

        if ($line) {
            $line->increment('quantity', $quantity);
        } else {
            $line = $orderSection->lines()->create(['product_id' => $data['product_id'], 'quantity' => $quantity, 'note' => $note]);
        }

        event(new OrderKitchenUpdated($orderSection->order_id));

        return response()->json($line->load('product'), 201);
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
