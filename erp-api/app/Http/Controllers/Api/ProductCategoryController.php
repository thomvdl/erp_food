<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductCategory;
use App\Support\ImageUpload;
use Illuminate\Http\Request;

class ProductCategoryController extends Controller
{
    public function index()
    {
        return ProductCategory::query()->orderBy('position')->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        // Sans position fournie, la catégorie part en dernière position plutôt qu'en tête (0).
        $data['position'] ??= (int) ProductCategory::query()->max('position') + 1;

        return response()->json(ProductCategory::query()->create($data), 201);
    }

    public function show(ProductCategory $productCategory)
    {
        return $productCategory;
    }

    public function update(Request $request, ProductCategory $productCategory)
    {
        $data = $this->validated($request);
        // Voir ProductController::update — choisir une icône efface une éventuelle image existante.
        $data = array_merge($data, ImageUpload::clearIfIconChosen($productCategory, $data['icon'] ?? null));

        $productCategory->update($data);

        return $productCategory;
    }

    /** Voir ProductController::uploadImage — même principe, endpoint séparé du store/update JSON. */
    public function uploadImage(Request $request, ProductCategory $productCategory)
    {
        $request->validate(['image' => ['required', 'image', 'max:4096']]);
        ImageUpload::store($productCategory, $request->file('image'), 'product-categories');

        return $productCategory->fresh();
    }

    public function removeImage(ProductCategory $productCategory)
    {
        ImageUpload::remove($productCategory);

        return $productCategory->fresh();
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
            'icon' => ['nullable', 'string', 'max:8'],
        ]);
    }
}
