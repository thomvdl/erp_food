<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Passe;
use Illuminate\Http\Request;

/**
 * "Ça passe dans le bon passe" (voir Readme.md, kitchen display) — un passe est un point
 * d'expédition partagé par une ou plusieurs stations (`stations.passe_id`, voir CONTEXT.md pour
 * l'historique du sens de cette relation — choisi depuis le formulaire Station, pas ici).
 * Utilisé par erp_kitchen_display pour déterminer le passe correspondant d'une section (station
 * de sa première ligne, voir OrderSectionController::envoyer).
 */
class PasseController extends Controller
{
    public function index()
    {
        return Passe::query()->with('stations')->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'active' => ['boolean'],
        ]);

        return response()->json(Passe::query()->create($data), 201);
    }

    public function show(Passe $passe)
    {
        return $passe->load('stations');
    }

    public function update(Request $request, Passe $passe)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'active' => ['boolean'],
        ]);

        $passe->update($data);

        return $passe->load('stations');
    }
}
