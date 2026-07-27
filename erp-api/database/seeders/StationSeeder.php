<?php

namespace Database\Seeders;

use App\Models\Station;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class StationSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $stations = ['Viande', 'Poisson', 'Froid', 'Dessert', 'Bar'];

        foreach ($stations as $name) {
            Station::query()->firstOrCreate(['slug' => Str::slug($name)], ['name' => $name]);
        }
    }
}
