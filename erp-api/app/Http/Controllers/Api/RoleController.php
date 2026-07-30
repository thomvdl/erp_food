<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use Illuminate\Http\Request;

// CRUD complet, contrairement à ERP/ où RoleController est volontairement lecture seule (rôles
// seedés) — ici demandé explicitement ("gérer les utilisateurs ET les différents rôles").
class RoleController extends Controller
{
    public function index()
    {
        return Role::query()->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'active' => ['boolean'],
        ]);

        return response()->json(Role::query()->create($data), 201);
    }

    public function show(Role $role)
    {
        return $role;
    }

    public function update(Request $request, Role $role)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'active' => ['boolean'],
        ]);

        $role->update($data);

        return $role;
    }
}
