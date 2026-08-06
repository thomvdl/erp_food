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
        // Taux TVA belges : 21% (taux normal), 12% (ex. restauration/HORECA hors boissons),
        // 6% (ex. alimentation, à emporter), 0% (exonéré).
        $taxes = [
            ['slug' => 'tva-21', 'value' => 21.00],
            ['slug' => 'tva-12', 'value' => 12.00],
            ['slug' => 'tva-6', 'value' => 6.00],
            ['slug' => 'sans-tva', 'value' => 0.00],
        ];

        foreach ($taxes as $tax) {
            Tax::query()->firstOrCreate(['slug' => $tax['slug']], $tax);
        }
    }
}
