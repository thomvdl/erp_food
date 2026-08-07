<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductCatalog;
use Illuminate\Http\Request;

class ProductCatalogController extends Controller
{
    public function index()
    {
        return ProductCatalog::query()->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'active' => ['boolean'],
        ]);

        return response()->json(ProductCatalog::query()->create($data), 201);
    }

    public function show(ProductCatalog $productCatalog)
    {
        return $productCatalog;
    }

    public function update(Request $request, ProductCatalog $productCatalog)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'active' => ['boolean'],
        ]);

        $productCatalog->update($data);

        return $productCatalog;
    }

    /**
     * Plusieurs catalogues peuvent être actifs à la fois pour le POS Restaurant (voir Readme.md)
     * — indépendant des autres contextes (voir setActiveForDirectSale/setActiveForSelfOrder/
     * setActiveForKiosk), chacun a son propre jeu de catalogues actifs. "active_restaurant" est
     * exclu du #[Fillable] du modèle, donc forceFill() est nécessaire pour contourner la
     * protection de mass-assignment — ne doit jamais transiter par store/update classiques.
     */
    public function setActiveForRestaurant(Request $request, ProductCatalog $productCatalog)
    {
        $data = $request->validate(['active' => ['required', 'boolean']]);
        $productCatalog->forceFill(['active_restaurant' => $data['active']])->save();

        return $productCatalog->refresh();
    }

    /** Même principe que setActiveForRestaurant, pour le POS Vente directe. */
    public function setActiveForDirectSale(Request $request, ProductCatalog $productCatalog)
    {
        $data = $request->validate(['active' => ['required', 'boolean']]);
        $productCatalog->forceFill(['active_direct_sale' => $data['active']])->save();

        return $productCatalog->refresh();
    }

    /**
     * Même principe, pour erp_self_order (mode QR) — voir SelfOrderController, qui expose
     * l'union des produits de tous les catalogues actifs pour ce contexte.
     */
    public function setActiveForSelfOrder(Request $request, ProductCatalog $productCatalog)
    {
        $data = $request->validate(['active' => ['required', 'boolean']]);
        $productCatalog->forceFill(['active_self_order' => $data['active']])->save();

        return $productCatalog->refresh();
    }

    /**
     * Même principe, pour erp_kiosk — voir KioskOrderController/KioskCheckoutController, qui
     * exposent l'union des produits de tous les catalogues actifs pour ce contexte (indépendant
     * du contexte self_order/QR).
     */
    public function setActiveForKiosk(Request $request, ProductCatalog $productCatalog)
    {
        $data = $request->validate(['active' => ['required', 'boolean']]);
        $productCatalog->forceFill(['active_kiosk' => $data['active']])->save();

        return $productCatalog->refresh();
    }
}
