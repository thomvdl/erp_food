<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;

/**
 * Coordonnées de l'établissement (voir config/company.php) — exposées à erp-app pour les
 * afficher en en-tête du reçu de ticket imprimable (ticket-receipt.ts), en plus du pied déjà
 * utilisé dans les emails clients (voir resources/views/emails/partials/company-footer.blade.php).
 */
class CompanyController extends Controller
{
    public function show()
    {
        return config('company');
    }
}
