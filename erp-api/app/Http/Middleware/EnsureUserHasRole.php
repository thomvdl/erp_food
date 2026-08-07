<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * "Il n'y aura que trois rôles" (voir Readme.md) — pas de table de permissions éditable, juste
 * un contrôle par slug de rôle, avec 'admin' qui passe toujours (voir User::isAdmin/
 * isAtLeastSuperviseur). Usage : `Route::middleware('role:admin')` ou
 * `Route::middleware('role:superviseur')` (admin y passe aussi, hiérarchie fixe).
 */
class EnsureUserHasRole
{
    public function handle(Request $request, Closure $next, string $minimum): Response
    {
        $user = $request->user();

        $allowed = match ($minimum) {
            'admin' => $user?->isAdmin() ?? false,
            'superviseur' => $user?->isAtLeastSuperviseur() ?? false,
            default => false,
        };

        if (!$allowed) {
            abort(403, "Vous n'avez pas les droits pour effectuer cette action.");
        }

        return $next($request);
    }
}
