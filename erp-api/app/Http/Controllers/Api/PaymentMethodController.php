<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PaymentMethod;

class PaymentMethodController extends Controller
{
    /**
     * Lecture seule pour l'instant — consommé par le sélecteur de moyen de paiement du POS,
     * pas encore de page de gestion dédiée (les moyens de paiement sont seedés).
     */
    public function index()
    {
        return PaymentMethod::query()->orderBy('name')->get();
    }
}
