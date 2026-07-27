<?php

namespace Database\Seeders;

use App\Models\Tax;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

// Pas de `name` sur Tax (voir Readme.md : slug + value seulement), le slug encode déjà le taux.
class TaxSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $taxes = [
            ['slug' => 'tva-20', 'value' => 20.00],
            ['slug' => 'tva-10', 'value' => 10.00],
            ['slug' => 'tva-5-5', 'value' => 5.50],
            ['slug' => 'sans-tva', 'value' => 0.00],
        ];

        foreach ($taxes as $tax) {
            Tax::query()->firstOrCreate(['slug' => $tax['slug']], $tax);
        }
    }
}
