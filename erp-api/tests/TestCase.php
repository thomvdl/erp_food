<?php

namespace Tests;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Laravel\Sanctum\Sanctum;

abstract class TestCase extends BaseTestCase
{
    /**
     * La plupart des tests existants authentifient "un membre du staff" générique sans tester le
     * système de rôles lui-même (voir RoleAccessTest pour ça) — admin passe toutes les
     * restrictions (voir User::isAdmin/isAtLeastSuperviseur), donc c'est le rôle par défaut le
     * moins surprenant ici pour ne pas casser des tests qui ne parlent pas de permissions.
     */
    protected function actingAsAdmin(): User
    {
        $user = User::factory()->create();
        $role = Role::query()->firstOrCreate(['slug' => 'admin'], ['name' => 'Administrateur']);
        $user->roles()->attach($role);

        Sanctum::actingAs($user);

        return $user;
    }
}
