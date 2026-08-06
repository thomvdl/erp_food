<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductCatalog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
     * Un seul catalogue actif à la fois pour le POS Restaurant — indépendant du catalogue actif
     * pour le POS Vente directe (voir activateForDirectSale). "active_restaurant" est exclu du
     * #[Fillable] du modèle, donc forceFill() est nécessaire pour contourner la protection de
     * mass-assignment.
     */
    public function activateForRestaurant(ProductCatalog $productCatalog)
    {
        DB::transaction(function () use ($productCatalog) {
            ProductCatalog::query()->where('id', '!=', $productCatalog->id)->update(['active_restaurant' => false]);
            $productCatalog->forceFill(['active_restaurant' => true])->save();
        });

        return $productCatalog->refresh();
    }

    /**
     * Même principe que activateForRestaurant, mais pour le POS Vente directe — les deux
     * sélections sont indépendantes, un même catalogue peut être actif pour les deux à la fois.
     */
    public function activateForDirectSale(ProductCatalog $productCatalog)
    {
        DB::transaction(function () use ($productCatalog) {
            ProductCatalog::query()->where('id', '!=', $productCatalog->id)->update(['active_direct_sale' => false]);
            $productCatalog->forceFill(['active_direct_sale' => true])->save();
        });

        return $productCatalog->refresh();
    }

    /**
     * Même principe, pour erp_self_order (QR et kiosque) — voir SelfOrderController, qui lit
     * exclusivement ce flag pour savoir quel catalogue exposer publiquement.
     */
    public function activateForSelfOrder(ProductCatalog $productCatalog)
    {
        DB::transaction(function () use ($productCatalog) {
            ProductCatalog::query()->where('id', '!=', $productCatalog->id)->update(['active_self_order' => false]);
            $productCatalog->forceFill(['active_self_order' => true])->save();
        });

        return $productCatalog->refresh();
    }

    /**
     * Même principe, pour erp_kiosk — voir KioskOrderController, qui lit exclusivement ce flag
     * pour savoir quel catalogue exposer au kiosque (indépendant du catalogue self_order/QR).
     */
    public function activateForKiosk(ProductCatalog $productCatalog)
    {
        DB::transaction(function () use ($productCatalog) {
            ProductCatalog::query()->where('id', '!=', $productCatalog->id)->update(['active_kiosk' => false]);
            $productCatalog->forceFill(['active_kiosk' => true])->save();
        });

        return $productCatalog->refresh();
    }
}
