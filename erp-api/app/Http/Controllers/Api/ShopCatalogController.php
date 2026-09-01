<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KioskBanner;
use App\Models\Param;
use App\Models\Product;
use App\Models\ProductCatalog;
use App\Models\ProductCategory;

/**
 * API publique (hors auth:sanctum) consommée par erp_public_shop — même principe que
 * SelfOrderController::show : un client anonyme parcourt l'union des produits de tous les
 * catalogues actuellement actifs pour la boutique en ligne (voir
 * ProductCatalogController::setActiveForPublicShop). Contrairement au self-order (pas de notion
 * de table/qr_token ici : c'est un vrai catalogue parcouru librement, avec navigation par
 * catégorie), donc les catégories sont renvoyées en plus des produits.
 */
class ShopCatalogController extends Controller
{
    public function index()
    {
        $catalogIds = ProductCatalog::query()->where('active_public_shop', true)->where('active', true)->pluck('id');

        $products = Product::query()
            ->whereHas('catalogs', fn ($query) => $query->whereIn('product_catalogs.id', $catalogIds))
            ->where('products.active', true)
            ->with(['category', 'menuGroups.options.ingredients', 'ingredients'])
            ->orderBy('name')
            ->get([
                'products.id', 'products.name', 'products.description', 'products.price', 'products.tax_id',
                'products.product_category_id', 'products.icon', 'products.image_path', 'products.stock_quantity',
                'products.is_menu',
            ]);

        $categoryIds = $products->pluck('product_category_id')->filter()->unique();

        $categories = ProductCategory::query()
            ->whereIn('id', $categoryIds)
            ->where('active', true)
            ->orderBy('position')
            ->get(['id', 'name', 'slug', 'position', 'icon', 'image_path']);

        return response()->json([
            'categories' => $categories,
            'products' => $products,
            // Aperçu affiché côté checkout avant soumission (voir ShopCheckoutController::store,
            // qui recalcule/fige le vrai montant côté serveur — jamais confiance à cette valeur
            // pour le total réellement facturé).
            'delivery_fee' => (float) (Param::query()->where('name', 'shop_delivery_fee')->value('value') ?? 0),
            // Affiché dans la topbar (voir shared/delivery-address côté front) — même Param que
            // App\Support\DeliveryZone, pour ne jamais afficher un rayon différent de celui
            // réellement appliqué au paiement.
            'delivery_radius_km' => (float) (Param::query()->where('name', 'shop_delivery_radius_km')->value('value') ?? 10),
            // Même carrousel hero que erp_kiosk / erp_self_order (voir KioskBannerController,
            // Paramètres > Bannières kiosque) — une seule liste à gérer côté admin pour les trois
            // canaux, voir SelfOrderController::show.
            'banners' => KioskBanner::query()->orderBy('position')->get(),
        ]);
    }
}
