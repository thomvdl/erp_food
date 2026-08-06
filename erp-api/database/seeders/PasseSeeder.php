<?php

namespace Database\Seeders;

use App\Models\Passe;
use App\Models\Station;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * "C'est dans station qu'on doit pouvoir choisir dans quelle passe ça doit aller" (voir
 * Readme.md) — `stations.passe_id`, comme dans `ERP/` (le projet original) : plusieurs stations
 * peuvent partager un même passe. Les passes sont donc créés d'abord (sans lien), puis chaque
 * station est rattachée à son passe — inverse de l'ancien PasseSeeder qui créait le passe
 * directement avec sa station.
 */
class PasseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $passes = [
            'Passe Cuisine' => 'Cuisine',
            'Passe Bar' => 'Bar',
        ];

        foreach ($passes as $passeName => $stationName) {
            $passe = Passe::query()->firstOrCreate(
                ['slug' => Str::slug($passeName)],
                ['name' => $passeName],
            );

            Station::query()->where('slug', Str::slug($stationName))->update(['passe_id' => $passe->id]);
        }
    }
}
