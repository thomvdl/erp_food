<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * "Mettre en place l'authentification pour app et validate event" (voir Readme.md) : deux façons
 * de se connecter — nom d'utilisateur + mot de passe, ou scan d'un QR code personnel (le QR
 * encode `users.barcode`, un secret unique par utilisateur généré via
 * UserController::generateQrCode — un scan vaut identification ET authentification, comme un
 * badge). Émet un token Sanctum (Bearer), pas de session cookie : les deux apps front sont des
 * SPA qui appellent l'API depuis des origines différentes.
 */
class AuthController extends Controller
{
    public function login(Request $request)
    {
        if ($request->filled('barcode')) {
            return $this->loginWithBarcode($request);
        }

        return $this->loginWithPassword($request);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }

    public function me(Request $request)
    {
        return $request->user()->load('roles');
    }

    private function loginWithPassword(Request $request)
    {
        $data = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $user = User::query()->where('username', $data['username'])->first();

        if (!$user || !$user->password || !Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'username' => ['Identifiants invalides.'],
            ]);
        }

        return $this->respondWithToken($user);
    }

    private function loginWithBarcode(Request $request)
    {
        $data = $request->validate([
            'barcode' => ['required', 'string'],
        ]);

        $user = User::query()->where('barcode', $data['barcode'])->first();

        if (!$user) {
            throw ValidationException::withMessages([
                'barcode' => ['Code QR invalide.'],
            ]);
        }

        return $this->respondWithToken($user);
    }

    private function respondWithToken(User $user)
    {
        $token = $user->createToken(request()->userAgent() ?? 'login')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $user->load('roles'),
        ]);
    }
}
