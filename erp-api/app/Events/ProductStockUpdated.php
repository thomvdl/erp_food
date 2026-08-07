<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Diffusé à chaque changement de `products.stock_quantity` sur un produit à stock SUIVI (jamais
 * pour un produit non suivi, voir App\Support\StockManager) — canal public "products", même
 * principe que "kitchen" (voir OrderKitchenUpdated) : pas de scope par utilisateur, tous les
 * écrans de vente (POS Vente directe, POS Restaurant, Kiosque, erp_self_order) partagent la même
 * vue du stock. Deux sources : une vente réelle (StockManager::consume, décrémente) ou une
 * correction manuelle depuis Paramètres > Produits (ProductController::update, admin qui
 * réapprovisionne). Payload complet (pas juste l'id, contrairement à OrderKitchenUpdated) : évite
 * un aller-retour HTTP supplémentaire sur chaque écran de vente juste pour connaître le nouveau
 * solde — ce n'est qu'un entier, pas une recharge de la commande/du panier entier.
 * ShouldBroadcastNow (pas ShouldBroadcast) : pas de worker de queue actif dans ce projet, la
 * diffusion doit rester synchrone.
 */
class ProductStockUpdated implements ShouldBroadcastNow
{
    use Dispatchable;

    public function __construct(
        public int $productId,
        public ?int $stockQuantity,
    ) {
    }

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new Channel('products')];
    }

    public function broadcastAs(): string
    {
        return 'product.stock-updated';
    }
}
