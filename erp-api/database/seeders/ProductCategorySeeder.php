<?php

namespace Database\Seeders;

use App\Models\ProductCategory;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class ProductCategorySeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        // Icône (emoji) cohérente par catégorie (voir App\Support\ImageUpload) — même principe
        // que DemoSeeder::seedProducts : juste un repère visuel par défaut, l'admin reste libre
        // de la changer ou d'uploader une vraie image depuis erp-app.
        $categories = [
            'Entrées' => '🥗',
            'Plats' => '🍽️',
            'Desserts' => '🍰',
            'Boissons chaudes' => '☕',
            'Boissons froides' => '🥤',
            'Vins & Bières' => '🍷',
            'Snacking' => '🍟',
        ];

        foreach ($categories as $name => $icon) {
            $category = ProductCategory::query()->firstOrCreate(['slug' => Str::slug($name)], ['name' => $name]);

            // firstOrCreate ne retouche jamais une ligne déjà existante : les catégories créées
            // avant l'ajout du champ icon (voir migration
            // add_icon_and_image_path_to_product_categories_table) n'en ont pas encore — on les
            // complète ici, mais jamais si une icône/image a déjà été choisie à la main entretemps.
            if (!$category->icon && !$category->image_path) {
                $category->update(['icon' => $icon]);
            }
        }
    }
}
