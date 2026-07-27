<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $roles = [
            ['slug' => 'admin', 'name' => 'Administrateur'],
            ['slug' => 'superviseur', 'name' => 'Superviseur'],
            ['slug' => 'user', 'name' => 'Utilisateur'],
        ];

        foreach ($roles as $role) {
            Role::query()->firstOrCreate(['slug' => $role['slug']], $role);
        }
    }
}
