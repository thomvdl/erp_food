<?php

namespace Database\Seeders;

use App\Models\ProductCatalog;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class ProductCatalogSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $base = ProductCatalog::query()->firstOrCreate(
            ['slug' => Str::slug('Catalogue de base')],
            ['name' => 'Catalogue de base'],
        );

        ProductCatalog::query()->firstOrCreate(
            ['slug' => Str::slug('Catalogue weekend')],
            ['name' => 'Catalogue weekend'],
        );

        // `active_restaurant`/`active_direct_sale` exclus du #[Fillable] de ProductCatalog (voir
        // ProductCatalogController@activateForRestaurant/activateForDirectSale) — forceFill()
        // nécessaire ici aussi pour les poser au moins une fois à l'installation, sur le même
        // catalogue de base pour les deux contextes.
        if (! ProductCatalog::query()->where('active_restaurant', true)->exists()) {
            $base->forceFill(['active_restaurant' => true])->save();
        }

        if (! ProductCatalog::query()->where('active_direct_sale', true)->exists()) {
            $base->forceFill(['active_direct_sale' => true])->save();
        }
    }
}
