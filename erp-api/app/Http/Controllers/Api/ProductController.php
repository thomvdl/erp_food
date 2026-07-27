<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    private const WITH = ['station', 'category', 'catalogs', 'tax'];

    public function index()
    {
        return Product::query()->with(self::WITH)->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $catalogIds = $data['catalog_ids'] ?? [];
        unset($data['catalog_ids']);

        $product = Product::query()->create($data);
        $product->catalogs()->sync($catalogIds);

        return response()->json($product->load(self::WITH), 201);
    }

    public function show(Product $product)
    {
        return $product->load(self::WITH);
    }

    public function update(Request $request, Product $product)
    {
        $data = $this->validated($request);
        $catalogIds = $data['catalog_ids'] ?? [];
        unset($data['catalog_ids']);

        $product->update($data);
        $product->catalogs()->sync($catalogIds);

        return $product->load(self::WITH);
    }

    public function destroy(Product $product)
    {
        $product->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'price' => ['required', 'numeric', 'min:0'],
            'sku' => ['nullable', 'string', 'max:100'],
            'active' => ['boolean'],
            'tax_id' => ['nullable', 'integer', 'exists:taxes,id'],
            'station_id' => ['nullable', 'integer', 'exists:stations,id'],
            'product_category_id' => ['nullable', 'integer', 'exists:product_categories,id'],
            'catalog_ids' => ['array'],
            'catalog_ids.*' => ['integer', 'exists:product_catalogs,id'],
        ]);
    }
}
