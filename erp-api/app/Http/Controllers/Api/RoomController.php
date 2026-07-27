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
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        return response()->json(Room::query()->create($data), 201);
    }

    public function show(Room $room)
    {
        return $room->load('tables');
    }

    public function update(Request $request, Room $room)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $room->update($data);

        return $room;
    }

    public function destroy(Room $room)
    {
        $room->delete();

        return response()->noContent();
    }
}
