<?php

namespace App\Models;

use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

// "active_restaurant"/"active_direct_sale"/"active_self_order"/"active_kiosk" volontairement
// absents du Fillable : ne doivent jamais transiter par les payloads store/update classiques,
// seulement être écrits par ProductCatalogController@setActiveForRestaurant/setActiveForDirectSale/
// setActiveForSelfOrder/setActiveForKiosk. Plusieurs catalogues peuvent être actifs à la fois pour
// un même contexte (voir Readme.md) — ces 4 flags sont juste des booléens indépendants par
// catalogue, pas une sélection exclusive.
#[Fillable(['name', 'slug', 'active'])]
class ProductCatalog extends Model
{
    use HasSlug;

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'active_restaurant' => 'boolean',
            'active_direct_sale' => 'boolean',
            'active_self_order' => 'boolean',
            'active_kiosk' => 'boolean',
        ];
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'catalog_product');
    }
}
