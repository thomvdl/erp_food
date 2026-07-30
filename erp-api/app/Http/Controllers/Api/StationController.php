<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Station;
use Illuminate\Http\Request;

class StationController extends Controller
{
    public function index()
    {
        return Station::query()->with('passe')->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'passe_id' => ['nullable', 'integer', 'exists:passes,id'],
            'active' => ['boolean'],
        ]);

        return response()->json(Station::query()->create($data)->load('passe'), 201);
    }

    public function show(Station $station)
    {
        return $station->load('passe');
    }

    public function update(Request $request, Station $station)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'passe_id' => ['nullable', 'integer', 'exists:passes,id'],
            'active' => ['boolean'],
        ]);

        $station->update($data);

        return $station->load('passe');
    }
}
