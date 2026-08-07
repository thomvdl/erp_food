<?php

namespace App\Models;

use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Facades\Storage;

#[Fillable([
    'name', 'slug', 'description', 'price', 'sku', 'active', 'is_combo', 'tax_id', 'station_id',
    'product_category_id', 'preparation_time', 'icon', 'image_path', 'stock_quantity',
])]
class Product extends Model
{
    use HasSlug;

    /** image_url : calculé, jamais stocké — voir imageUrl() ci-dessous. */
    protected $appends = ['image_url'];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'active' => 'boolean',
            'is_combo' => 'boolean',
            'preparation_time' => 'integer',
            'stock_quantity' => 'integer',
        ];
    }

    /** URL publique de l'image uploadée (voir App\Support\ImageUpload) — null si aucune image
     *  (soit pas de visuel, soit un `icon` choisi à la place, les deux étant mutuellement
     *  exclusifs). Toujours dérivée de `image_path`, jamais stockée telle quelle : reste valide
     *  si APP_URL change entre environnements. */
    protected function imageUrl(): Attribute
    {
        return Attribute::make(get: fn () => $this->image_path ? Storage::disk('public')->url($this->image_path) : null);
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
