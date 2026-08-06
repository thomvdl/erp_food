<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    private const WITH = ['station', 'category', 'catalogs', 'tax', 'components'];

    public function index()
    {
        return Product::query()->with(self::WITH)->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $catalogIds = $data['catalog_ids'] ?? [];
        $components = $data['component_ids'] ?? [];
        unset($data['catalog_ids'], $data['component_ids']);

        $product = Product::query()->create($data);
        $product->catalogs()->sync($catalogIds);
        $product->components()->sync($this->syncableComponents($components));

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
        $components = $data['component_ids'] ?? [];
        unset($data['catalog_ids'], $data['component_ids']);

        $product->update($data);
        $product->catalogs()->sync($catalogIds);
        $product->components()->sync($this->syncableComponents($components));

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
            'preparation_time' => ['nullable', 'integer', 'min:0'],
            'sku' => ['nullable', 'string', 'max:100'],
            'active' => ['boolean'],
            'tax_id' => ['nullable', 'integer', 'exists:taxes,id'],
            'station_id' => ['nullable', 'integer', 'exists:stations,id'],
            'product_category_id' => ['nullable', 'integer', 'exists:product_categories,id'],
            'catalog_ids' => ['array'],
            'catalog_ids.*' => ['integer', 'exists:product_catalogs,id'],
            // "is_combo" : un produit composé de plusieurs autres (voir components ci-dessous) —
            // affiché éclaté au Kitchen Display, mais un simple Product partout ailleurs
            // (panier, ticket, facturation) — voir Product::components().
            'is_combo' => ['boolean'],
            'component_ids' => ['array'],
            // ->where('is_combo', false) : pas de combo imbriqué dans un combo, pour garder
            // l'éclatement du Kitchen Display à un seul niveau.
            'component_ids.*.product_id' => ['integer', Rule::exists('products', 'id')->where('is_combo', false)],
            'component_ids.*.quantity' => ['integer', 'min:1'],
        ]);
    }

    /**
     * @param array<int, array{product_id: int, quantity: int}> $components
     * @return array<int, array{quantity: int}>
     */
    private function syncableComponents(array $components): array
    {
        return collect($components)->mapWithKeys(fn (array $component) => [
            $component['product_id'] => ['quantity' => $component['quantity'] ?? 1],
        ])->all();
    }
}
