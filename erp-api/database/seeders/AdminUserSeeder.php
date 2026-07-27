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
        $admin = User::query()->firstOrCreate(
            ['email' => env('ADMIN_EMAIL', 'admin@erp.local')],
            [
                'username' => env('ADMIN_USERNAME', 'admin'),
                'password' => Hash::make(env('ADMIN_PASSWORD', 'password')),
            ],
        );

        $adminRole = Role::query()->where('slug', 'admin')->first();

        if ($adminRole && ! $admin->roles->contains($adminRole->id)) {
            $admin->roles()->attach($adminRole);
        }
    }
}
