<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Param;

class KitchenDisplayController extends Controller
{
    /**
     * Réglage "kitchen_display_show_filter_bar" exposé sous forme calculée — même principe que
     * KioskOrderController::config pour "kiosk_table_available" — jamais les réglages bruts de
     * /params, réservé à admin. true si absent (installation pas encore seedée, ou réglage
     * supprimé par erreur) : comportement historique inchangé, la barre de filtre Postes/Passes
     * reste visible sur le board plutôt que de se retrouver verrouillée sans que personne ne l'ait
     * demandé.
     */
    public function config()
    {
        $value = Param::query()->where('name', 'kitchen_display_show_filter_bar')->value('value');

        return response()->json([
            'filter_bar_visible' => $value === null || in_array(strtolower(trim((string) $value)), ['1', 'true'], true),
        ]);
    }
}
