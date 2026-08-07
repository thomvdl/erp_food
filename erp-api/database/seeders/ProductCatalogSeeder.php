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
        // ProductCatalogController@setActiveForRestaurant/setActiveForDirectSale) — forceFill()
        // nécessaire ici aussi pour les poser au moins une fois à l'installation, sur le même
        // catalogue de base pour les deux contextes.
        if (! ProductCatalog::query()->where('active_restaurant', true)->exists()) {
            $base->forceFill(['active_restaurant' => true])->save();
        }

        if (! ProductCatalog::query()->where('active_direct_sale', true)->exists()) {
            $base->forceFill(['active_direct_sale' => true])->save();
        }

        // Catalogue séparé pour les boissons (voir DemoSeeder::seedProducts, qui y déplace les
        // produits des catégories Boissons chaudes/froides/Vins & Bières hors du catalogue de
        // base) — retour utilisateur "séparer les boissons", pour pouvoir les activer/désactiver
        // indépendamment par contexte plutôt que toujours liées au reste du menu.
        $boissons = ProductCatalog::query()->firstOrCreate(
            ['slug' => Str::slug('Boissons')],
            ['name' => 'Boissons'],
        );

        // wasRecentlyCreated : seulement à la création du catalogue — reprend alors exactement les
        // mêmes contextes actifs que le catalogue de base (déjà à jour ci-dessus), sans quoi les
        // boissons disparaîtraient de tout écran de vente tant qu'un admin n'active pas ce nouveau
        // catalogue à la main. N'écrase jamais un choix d'activation fait depuis (pas de "sync"
        // répété à chaque seed).
        if ($boissons->wasRecentlyCreated) {
            $boissons->forceFill([
                'active_restaurant' => $base->active_restaurant,
                'active_direct_sale' => $base->active_direct_sale,
                'active_kiosk' => $base->active_kiosk,
                'active_self_order' => $base->active_self_order,
            ])->save();
        }
    }
}
