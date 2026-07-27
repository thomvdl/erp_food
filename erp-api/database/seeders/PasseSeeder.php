<?php

namespace Database\Seeders;

use App\Models\Passe;
use App\Models\Station;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Contrairement à ERP/ (où plusieurs stations pointent vers un passe partagé via
 * `stations.passe_id`), le schéma de erp_v2 inverse la relation : `passes.station_id` — un
 * passe appartient à UNE SEULE station (choix délibéré du brouillon Readme.md, voir
 * CONTEXT.md). Chaque passe est donc créé directement avec sa station, pas de seeder de
 * liaison séparé nécessaire (contrairement à StationPasseSeeder dans ERP/).
 */
class PasseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $passes = [
            'Passe Cuisine' => 'Viande',
            'Passe Bar' => 'Bar',
        ];

        foreach ($passes as $passeName => $stationName) {
            $station = Station::query()->where('slug', Str::slug($stationName))->first();

            if (! $station) {
                continue;
            }

            Passe::query()->firstOrCreate(
                ['slug' => Str::slug($passeName)],
                ['name' => $passeName, 'station_id' => $station->id],
            );
        }
    }
}
