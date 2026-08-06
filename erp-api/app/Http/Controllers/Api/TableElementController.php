<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Room;
use App\Models\TableElement;
use Illuminate\Http\Request;

// Imbrication "shallow" : index/store passent par la room (POST /api/rooms/{room}/tables),
// show/update non (PUT /api/tables/{table}) — même convention que
// ERP/erp-api/app/Http/Controllers/Api/RoomElementController.php pour Route::apiResource(...)->shallow().
// Pas de destroy() (voir Readme.md "ne plus avoir la possibilité de supprimer... ajouter un
// champ active") : une table se désactive via update(['active' => false]), ne se supprime plus.
class TableElementController extends Controller
{
    public function index(Room $room)
    {
        return $room->tables()->get();
    }

    public function store(Request $request, Room $room)
    {
        $data = $this->validated($request);
        // Sans ça, "active" (default(true) en base, voir add_active_to_tables_table) est absent
        // du modèle en mémoire après create() — Eloquent ne relit pas la ligne insérée — et le
        // JSON renvoyé au front omet le champ, faisant apparaître la table comme inactive dans
        // l'éditeur de plan juste après son ajout.
        $data['active'] ??= true;

        return response()->json($room->tables()->create($data), 201);
    }

    public function show(TableElement $table)
    {
        return $table;
    }

    public function update(Request $request, TableElement $table)
    {
        $data = $this->validated($request);

        $table->update($data);

        return $table;
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'type' => ['required', 'string', 'max:50'],
            'label' => ['nullable', 'string', 'max:255'],
            'pos_left' => ['required', 'integer'],
            'pos_top' => ['required', 'integer'],
            'width' => ['required', 'integer', 'min:10'],
            'height' => ['required', 'integer', 'min:10'],
            'active' => ['boolean'],
        ]);
    }
}
