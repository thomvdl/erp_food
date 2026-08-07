<?php

namespace App\Models;

use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

#[Fillable(['name', 'slug', 'description', 'price', 'sku', 'active', 'is_combo', 'tax_id', 'station_id', 'product_category_id', 'preparation_time'])]
class Product extends Model
{
    use HasSlug;

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'active' => 'boolean',
            'is_combo' => 'boolean',
            'preparation_time' => 'integer',
        ];
    }

    public function tax(): BelongsTo
    {
        return $this->belongsTo(Tax::class);
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'product_category_id');
    }

    public function catalogs(): BelongsToMany
    {
        return $this->belongsToMany(ProductCatalog::class, 'catalog_product');
    }

    /**
     * Produits qui composent CE combo (voir product_components) — vide pour un produit normal.
     * `quantity` sur le pivot : ex. un combo peut inclure 2× frites.
     */
    public function components(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'product_components', 'combo_id', 'component_product_id')
            ->withPivot('quantity');
    }
}
