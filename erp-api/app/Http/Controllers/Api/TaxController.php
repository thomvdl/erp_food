<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tax;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// Pas de HasSlug ici : Tax n'a pas de champ `name` dont dériver un slug (voir Readme.md,
// Taxe = slug + value seulement) — le slug est saisi directement par l'utilisateur.
class TaxController extends Controller
{
    public function index()
    {
        return Tax::query()->orderBy('slug')->get();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request, null);

        return response()->json(Tax::query()->create($data), 201);
    }

    public function show(Tax $tax)
    {
        return $tax;
    }

    public function update(Request $request, Tax $tax)
    {
        $data = $this->validated($request, $tax);

        $tax->update($data);

        return $tax;
    }

    public function destroy(Tax $tax)
    {
        $tax->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Tax $tax): array
    {
        return $request->validate([
            'slug' => ['required', 'string', 'max:255', Rule::unique('taxes', 'slug')->ignore($tax?->id)],
            'value' => ['required', 'numeric', 'min:0'],
        ]);
    }
}
