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
        $filterBarValue = Param::query()->where('name', 'kitchen_display_show_filter_bar')->value('value');
        $skipPasseValue = Param::query()->where('name', 'kitchen_display_skip_passe')->value('value');

        return response()->json([
            'filter_bar_visible' => $filterBarValue === null || in_array(strtolower(trim((string) $filterBarValue)), ['1', 'true'], true),
            // "kitchen_display_skip_passe" (voir OrderSectionController::marquerFait) — false si
            // absent : comportement historique inchangé (poste puis passe).
            'skip_passe' => in_array(strtolower(trim((string) $skipPasseValue)), ['1', 'true'], true),
        ]);
    }
}
