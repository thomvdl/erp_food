<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        // Match sur 'username' (pas 'email') : l'email admin peut légitimement diverger de
        // ADMIN_EMAIL après coup (ex. changé en base pour recevoir de vrais emails de test) sans
        // que .env soit mis à jour en retour — matcher sur l'email ferait alors planter ce
        // seeder à chaque redémarrage (firstOrCreate ne trouve rien, retente un insert, collision
        // sur la contrainte unique 'username').
        $admin = User::query()->firstOrCreate(
            ['username' => env('ADMIN_USERNAME', 'admin')],
            [
                'email' => env('ADMIN_EMAIL', 'admin@erp.local'),
                'password' => Hash::make(env('ADMIN_PASSWORD', 'password')),
            ],
        );

        $adminRole = Role::query()->where('slug', 'admin')->first();

        if ($adminRole && ! $admin->roles->contains($adminRole->id)) {
            $admin->roles()->attach($adminRole);
        }
    }
}
