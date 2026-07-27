<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index()
    {
        return User::query()->with('roles')->orderBy('username')->get();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request, null);
        $roleIds = $data['role_ids'] ?? [];
        unset($data['role_ids']);

        $user = User::query()->create($data);
        $user->roles()->sync($roleIds);

        return response()->json($user->load('roles'), 201);
    }

    public function show(User $user)
    {
        return $user->load('roles');
    }

    public function update(Request $request, User $user)
    {
        $data = $this->validated($request, $user);
        $roleIds = $data['role_ids'] ?? [];
        unset($data['role_ids']);

        // Mot de passe optionnel à l'édition : laisser le champ vide ne réinitialise pas le
        // mot de passe existant (même convention que ERP/erp-api/UserController).
        if (empty($data['password'])) {
            unset($data['password']);
        }

        $user->update($data);
        $user->roles()->sync($roleIds);

        return $user->load('roles');
    }

    public function destroy(User $user)
    {
        $user->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?User $user): array
    {
        return $request->validate([
            'username' => ['required', 'string', 'max:255', Rule::unique('users', 'username')->ignore($user?->id)],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user?->id)],
            'password' => [$user ? 'nullable' : 'required', 'string', 'min:8'],
            'role_ids' => ['array'],
            'role_ids.*' => ['integer', 'exists:roles,id'],
        ]);
    }
}
