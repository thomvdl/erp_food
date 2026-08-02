<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Room;
use Illuminate\Http\Request;

class RoomController extends Controller
{
    public function index()
    {
        return Room::query()->with('tables')->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        return response()->json(Room::query()->create($data), 201);
    }

    public function show(Room $room)
    {
        return $room->load('tables');
    }

    public function update(Request $request, Room $room)
    {
        $data = $this->validated($request);

        $room->update($data);

        return $room;
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            // "self_order" : références génériques pour erp_self_order (chambre d'hôtel, point
            // kiosque...) — des lignes de `tables` sans plan visuel, voir SelfOrderController.
            'type' => ['required', 'string', 'in:restaurant,event,self_order'],
            'width' => ['sometimes', 'integer', 'min:100'],
            'height' => ['sometimes', 'integer', 'min:100'],
            'active' => ['boolean'],
        ]);
    }
}
