<?php

namespace App\Support;

use App\Events\ProductStockUpdated;
use App\Models\Product;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Stock optionnel par produit (voir products.stock_quantity, `null` = non suivi/illimité —
 * comportement inchangé pour un produit qui ne l'a jamais renseigné). Deux opérations :
 *   - `consume()` : vérifie ET décrémente, au moment où le stock est réellement engagé —
 *     TicketController::store (vente directe, au paiement), OrderSectionController::valider()
 *     (POS Restaurant, DÈS la validation d'une section — pas au paiement final, potentiellement
 *     bien plus tard : une fois validée la section part en cuisine, c'est le vrai moment de
 *     consommation physique), SelfOrderController::store() (une commande self-order part
 *     directement en 'ask', un cran plus engagée qu'une simple section validée — même règle),
 *     OrderController::pay() (seulement pour les sections qui n'ont PAS déjà consommé leur stock
 *     plus tôt — voir order_sections.stock_consumed ; ne reste comme cas réel que les tables
 *     ouvertes avant l'introduction de cette colonne), KioskSaleRecorder::record() (kiosque, les
 *     deux variants de paiement).
 *   - `restore()` : redonne du stock déjà consommé — OrderController::destroy(), quand une
 *     commande est annulée après qu'une ou plusieurs de ses sections aient déjà décrémenté leur
 *     stock (validation POS Restaurant ou soumission self-order), sans quoi ce stock serait
 *     perdu définitivement pour rien.
 */
class StockManager
{
    /**
     * @param  array<int, array{product_id: int, quantity: int}>  $lines  `quantity` peut être
     *         négative (voir OrderController::pay — une ligne de correction inverse l'effet de la
     *         ligne d'origine, même convention que pour le calcul du total) : agrégée par produit
     *         AVANT contrôle, une correction ne redonne donc jamais de stock au-delà de ce qui a
     *         réellement été décrémenté sur ce même paiement.
     *
     * @throws ValidationException si un produit à stock suivi n'a plus assez d'unités.
     */
    public static function consume(array $lines): void
    {
        $quantities = self::netQuantitiesByProduct($lines);

        if ($quantities->isEmpty()) {
            return;
        }

        // lockForUpdate() : les appelants sont déjà dans une DB::transaction — évite qu'une vente
        // concurrente sur le même produit ne lise un stock périmé entre la vérification et la
        // décrémentation (ex. deux caisses vendant simultanément la dernière unité).
        $products = Product::query()->whereIn('id', $quantities->keys())->lockForUpdate()->get()->keyBy('id');

        foreach ($quantities as $productId => $quantity) {
            $product = $products->get($productId);

            // Produit introuvable (ne devrait pas arriver, déjà validé en amont) ou stock non
            // suivi : rien à contrôler/décrémenter.
            if (!$product || $product->stock_quantity === null || $quantity <= 0) {
                continue;
            }

            if ($product->stock_quantity < $quantity) {
                throw ValidationException::withMessages([
                    'lines' => ["Stock insuffisant pour \"{$product->name}\" ({$product->stock_quantity} restant(s))."],
                ]);
            }

            $product->decrement('stock_quantity', $quantity);

            self::broadcast($product);
        }
    }

    /**
     * Redonne le stock déjà consommé par `consume()` — voir OrderController::destroy(). Jamais de
     * contrôle de plafond ici (contrairement à consume()) : on ne fait que rendre ce qui a
     * réellement été pris, aucune raison que ça dépasse quoi que ce soit.
     *
     * @param  array<int, array{product_id: int, quantity: int}>  $lines
     */
    public static function restore(array $lines): void
    {
        $quantities = self::netQuantitiesByProduct($lines);

        if ($quantities->isEmpty()) {
            return;
        }

        $products = Product::query()->whereIn('id', $quantities->keys())->lockForUpdate()->get()->keyBy('id');

        foreach ($quantities as $productId => $quantity) {
            $product = $products->get($productId);

            if (!$product || $product->stock_quantity === null || $quantity <= 0) {
                continue;
            }

            $product->increment('stock_quantity', $quantity);

            self::broadcast($product);
        }
    }

    /**
     * Regroupe par produit — un même produit peut apparaître dans plusieurs lignes (deux sections
     * différentes, ex. deux tournées de commande). Ignore les agrégats négatifs ou nuls (rien à
     * contrôler/consommer/rendre).
     *
     * @param  array<int, array{product_id: int, quantity: int}>  $lines
     * @return Collection<int, int>
     */
    private static function netQuantitiesByProduct(array $lines): Collection
    {
        $quantities = [];
        foreach ($lines as $line) {
            $quantities[$line['product_id']] = ($quantities[$line['product_id']] ?? 0) + $line['quantity'];
        }

        return collect($quantities);
    }

    /** Voir App\Events\ProductStockUpdated — les écrans de vente ouverts sur ce produit se
     *  mettent à jour en direct, sans attendre un rechargement. */
    private static function broadcast(Product $product): void
    {
        event(new ProductStockUpdated($product->id, $product->stock_quantity));
    }
}
