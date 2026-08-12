<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use Illuminate\Http\Request;

/**
 * Liste globale et réutilisable entre tous les produits (ex. Oignon, Fromage, Tomate) — voir
 * ProductController pour le rattachement (removable ou non) à un produit précis.
 */
class IngredientController extends Controller
{
    public function index()
    {
        return Ingredient::query()->orderBy('position')->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        // Sans position fournie, l'ingrédient part en dernière position — même logique que
        // ProductCategoryController::store.
        $data['position'] ??= (int) Ingredient::query()->max('position') + 1;

        return response()->json(Ingredient::query()->create($data), 201);
    }

    public function show(Ingredient $ingredient)
    {
        return $ingredient;
    }

    public function update(Request $request, Ingredient $ingredient)
    {
        $data = $this->validated($request);
        $ingredient->update($data);

        return $ingredient;
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'position' => ['nullable', 'integer', 'min:0'],
            'active' => ['boolean'],
        ]);
    }
}
