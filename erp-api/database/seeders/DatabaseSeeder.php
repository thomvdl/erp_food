<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            RoleSeeder::class,
            AdminUserSeeder::class,
            StationSeeder::class,
            PasseSeeder::class,
            TaxSeeder::class,
            ProductCategorySeeder::class,
            ProductCatalogSeeder::class,
            PaymentMethodSeeder::class,
        ]);

        // À true (DEMO=true dans .env) pour peupler l'app de données fictives (plan de salle,
        // clients, personnel, catalogue produit) — même convention que ERP/.
        if (env('DEMO', false)) {
            $this->call(DemoSeeder::class);
        }
    }
}
