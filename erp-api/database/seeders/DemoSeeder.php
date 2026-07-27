<?php

namespace Database\Seeders;

use App\Models\Client;
use App\Models\ProductCatalog;
use App\Models\ProductCategory;
use App\Models\Product;
use App\Models\Role;
use App\Models\Room;
use App\Models\Station;
use App\Models\Tax;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Données fictives — plan de salle, clients, personnel, catalogue produit — pour ne pas avoir
 * des écrans vides juste après l'installation. Suppose que RoleSeeder/StationSeeder/TaxSeeder/
 * ProductCategorySeeder/ProductCatalogSeeder ont déjà tourné (voir DatabaseSeeder).
 *
 * Volontairement PAS de commandes/tickets de démo ici, contrairement à ERP/DemoSeeder :
 * `ticket_lines` n'a pas de snapshot de prix unitaire dans erp_v2 (question ouverte, voir
 * CONTEXT.md) et il n'existe encore aucun controller/page Order/Ticket pour les afficher —
 * des données de démo dessus seraient invisibles et figeraient une décision de modèle pas
 * encore prise.
 */
class DemoSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $this->seedStaff();
        $this->seedFloorPlan();
        $this->seedClients();
        $this->seedProducts();
    }

    private function seedStaff(): void
    {
        $superviseur = Role::query()->where('slug', 'superviseur')->first();
        $user = Role::query()->where('slug', 'user')->first();

        $defs = [
            ['username' => 'julie', 'email' => 'julie@erp.local', 'role' => $superviseur],
            ['username' => 'marc', 'email' => 'marc@erp.local', 'role' => $user],
            ['username' => 'sophie', 'email' => 'sophie@erp.local', 'role' => $user],
        ];

        foreach ($defs as $def) {
            $account = User::query()->firstOrCreate(
                ['email' => $def['email']],
                ['username' => $def['username'], 'password' => Hash::make('password')],
            );

            if ($def['role'] && ! $account->roles->contains($def['role']->id)) {
                $account->roles()->attach($def['role']);
            }
        }
    }

    private function seedFloorPlan(): void
    {
        $main = Room::query()->firstOrCreate(['slug' => Str::slug('Salle principale')], ['name' => 'Salle principale']);

        if ($main->tables()->count() === 0) {
            $tables = [
                ['label' => '1', 'pos_left' => 40, 'pos_top' => 60],
                ['label' => '2', 'pos_left' => 180, 'pos_top' => 60],
                ['label' => '3', 'pos_left' => 320, 'pos_top' => 60],
                ['label' => '4', 'pos_left' => 40, 'pos_top' => 200],
                ['label' => '5', 'pos_left' => 180, 'pos_top' => 200],
                ['label' => '6', 'pos_left' => 320, 'pos_top' => 200],
            ];

            foreach ($tables as $table) {
                $main->tables()->create([
                    'type' => 'table',
                    'label' => $table['label'],
                    'pos_left' => $table['pos_left'],
                    'pos_top' => $table['pos_top'],
                    'width' => 80,
                    'height' => 80,
                ]);
            }
        }

        $terrasse = Room::query()->firstOrCreate(['slug' => Str::slug('Terrasse')], ['name' => 'Terrasse']);

        if ($terrasse->tables()->count() === 0) {
            $tables = [
                ['label' => 'T1', 'pos_left' => 40, 'pos_top' => 60],
                ['label' => 'T2', 'pos_left' => 180, 'pos_top' => 60],
                ['label' => 'T3', 'pos_left' => 40, 'pos_top' => 200],
                ['label' => 'T4', 'pos_left' => 180, 'pos_top' => 200],
            ];

            foreach ($tables as $table) {
                $terrasse->tables()->create([
                    'type' => 'table',
                    'label' => $table['label'],
                    'pos_left' => $table['pos_left'],
                    'pos_top' => $table['pos_top'],
                    'width' => 80,
                    'height' => 80,
                ]);
            }
        }
    }

    private function seedClients(): void
    {
        $defs = [
            ['firstname' => 'Marie', 'lastname' => 'Dupont', 'email' => 'marie.dupont@example.test', 'phone' => '0470000001'],
            ['firstname' => 'Jean', 'lastname' => 'Lefevre', 'email' => 'jean.lefevre@example.test', 'phone' => '0470000002'],
            ['firstname' => 'Claire', 'lastname' => 'Martin', 'email' => 'claire.martin@example.test', 'phone' => '0470000003'],
            ['firstname' => 'Paul', 'lastname' => 'Rousseau', 'email' => null, 'phone' => '0470000004'],
            ['firstname' => 'Julie', 'lastname' => 'Fontaine', 'email' => 'julie.fontaine@example.test', 'phone' => null],
        ];

        foreach ($defs as $def) {
            Client::query()->firstOrCreate(
                ['firstname' => $def['firstname'], 'lastname' => $def['lastname']],
                $def,
            );
        }
    }

    private function seedProducts(): void
    {
        $taxes = Tax::query()->get()->keyBy('slug');
        $stations = Station::query()->get()->keyBy('slug');
        $categories = ProductCategory::query()->get()->keyBy('name');
        $catalog = ProductCatalog::query()->where('slug', Str::slug('Catalogue de base'))->first();

        $defs = [
            'Entrées' => [
                ['Salade César', 7.50, 'tva-10', 'froid'],
                ["Soupe à l'oignon", 6.00, 'tva-10', 'viande'],
                ['Assiette de charcuterie', 9.00, 'tva-10', 'froid'],
            ],
            'Plats' => [
                ['Steak-frites', 16.50, 'tva-10', 'viande'],
                ['Saumon grillé', 18.00, 'tva-10', 'poisson'],
                ['Burger maison', 14.00, 'tva-10', 'viande'],
                ['Pâtes carbonara', 13.50, 'tva-10', 'viande'],
            ],
            'Desserts' => [
                ['Tarte tatin', 6.50, 'tva-10', 'dessert'],
                ['Mousse au chocolat', 5.50, 'tva-10', 'dessert'],
                ['Crème brûlée', 6.00, 'tva-10', 'dessert'],
            ],
            'Boissons chaudes' => [
                ['Café', 2.00, 'tva-10', 'bar'],
                ['Thé', 2.50, 'tva-10', 'bar'],
            ],
            'Boissons froides' => [
                ['Coca-Cola', 3.00, 'tva-10', 'bar'],
                ['Eau minérale', 2.50, 'tva-10', 'bar'],
                ["Jus d'orange", 3.50, 'tva-10', 'bar'],
            ],
            'Vins & Bières' => [
                ['Verre de vin rouge', 4.50, 'tva-20', 'bar'],
                ['Bière pression 25cl', 4.00, 'tva-20', 'bar'],
            ],
            'Snacking' => [
                ['Frites', 4.00, 'tva-10', 'viande'],
                ['Croque-monsieur', 7.00, 'tva-10', 'viande'],
            ],
        ];

        foreach ($defs as $categoryName => $items) {
            $category = $categories->get($categoryName);

            foreach ($items as [$name, $price, $taxSlug, $stationSlug]) {
                $product = Product::query()->firstOrCreate(
                    ['slug' => Str::slug($name)],
                    [
                        'name' => $name,
                        'price' => $price,
                        'active' => true,
                        'product_category_id' => $category?->id,
                        'tax_id' => $taxes->get($taxSlug)?->id,
                        'station_id' => $stations->get($stationSlug)?->id,
                    ],
                );

                // Many-to-many désormais (voir Product::catalogs()) : syncWithoutDetaching plutôt
                // qu'une simple FK, un produit de démo peut appartenir à plusieurs catalogues.
                if ($catalog) {
                    $product->catalogs()->syncWithoutDetaching([$catalog->id]);
                }
            }
        }
    }
}
