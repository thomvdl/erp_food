<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Room;
use App\Models\TableElement;
use Illuminate\Http\Request;

// Imbrication "shallow" : index/store passent par la room (POST /api/rooms/{room}/tables),
// show/update/destroy non (PUT/DELETE /api/tables/{table}) — même convention que
// ERP/erp-api/app/Http/Controllers/Api/RoomElementController.php pour Route::apiResource(...)->shallow().
class TableElementController extends Controller
{
    public function index(Room $room)
    {
        return $room->tables()->get();
    }

    public function store(Request $request, Room $room)
    {
        $data = $this->validated($request);

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

    public function destroy(TableElement $table)
    {
        $table->delete();

        return response()->noContent();
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
        ]);
    }
}
