<?php

namespace App\Models;

use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

// "active_restaurant"/"active_direct_sale" volontairement absents du Fillable : ne doivent
// jamais transiter par les payloads store/update classiques, seulement être écrits par
// ProductCatalogController@activateForRestaurant/activateForDirectSale.
#[Fillable(['name', 'slug'])]
class ProductCatalog extends Model
{
    use HasSlug;

    protected function casts(): array
    {
        return [
            'active_restaurant' => 'boolean',
            'active_direct_sale' => 'boolean',
        ];
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'catalog_product');
    }
}
