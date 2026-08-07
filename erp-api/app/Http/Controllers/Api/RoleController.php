<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;

// Lecture seule (voir Readme.md, "il n'y aura que trois rôles") — les trois rôles
// (admin/superviseur/user, voir RoleSeeder) sont fixes, plus de création/modification depuis
// l'app, même principe que ERP/ où RoleController était déjà volontairement lecture seule.
class RoleController extends Controller
{
    public function index()
    {
        return Role::query()->orderBy('name')->get();
    }

    public function show(Role $role)
    {
        return $role;
    }
}
