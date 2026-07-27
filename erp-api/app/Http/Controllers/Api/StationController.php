<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Station;
use Illuminate\Http\Request;

class StationController extends Controller
{
    public function index()
    {
        return Station::query()->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        return response()->json(Station::query()->create($data), 201);
    }

    public function show(Station $station)
    {
        return $station;
    }

    public function update(Request $request, Station $station)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $station->update($data);

        return $station;
    }

    public function destroy(Station $station)
    {
        $station->delete();

        return response()->noContent();
    }
}
