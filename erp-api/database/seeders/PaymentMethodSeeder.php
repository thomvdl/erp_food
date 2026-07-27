<?php

namespace Database\Seeders;

use App\Models\PaymentMethod;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class PaymentMethodSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $methods = ['Espèces', 'Carte bancaire', 'Bancontact', 'Chèque-repas'];

        foreach ($methods as $name) {
            PaymentMethod::query()->firstOrCreate(['slug' => Str::slug($name)], ['name' => $name]);
        }
    }
}
