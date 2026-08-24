<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\DeliveryZone;
use Illuminate\Http\Request;

/**
 * Vérification "à chaud" de l'adresse de livraison depuis la topbar d'erp_public_shop (voir
 * shared/delivery-address côté front) — public comme le reste de l'API boutique en ligne, avant
 * même que le client ait composé son panier. Revérifiée de toute façon côté serveur au moment du
 * paiement (voir ShopCheckoutController::store) : ce endpoint n'est qu'un aperçu, jamais la
 * source de vérité.
 */
class ShopDeliveryZoneController extends Controller
{
    public function check(Request $request)
    {
        $data = $request->validate([
            'address' => ['required', 'string', 'max:255'],
        ]);

        return response()->json(DeliveryZone::checkAddress($data['address']));
    }
}
