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
        $categories = [
            'Entrées',
            'Plats',
            'Desserts',
            'Boissons chaudes',
            'Boissons froides',
            'Vins & Bières',
            'Snacking',
        ];

        foreach ($categories as $name) {
            ProductCategory::query()->firstOrCreate(['slug' => Str::slug($name)], ['name' => $name]);
        }
    }
}
