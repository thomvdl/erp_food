import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Posé sur les routes réservées à un rôle minimum (voir Readme.md, "il n'y aura que trois
 * rôles") — s'appuie sur authGuard (posé sur la route racine Shell) qui a déjà résolu
 * `currentUser()` avant que ce garde ne s'exécute, pas besoin de refaire un appel réseau ici.
 * Redirige vers /pos-vente plutôt que de bloquer sans rien afficher : c'est la seule page dont
 * TOUS les rôles disposent (voir shell.ts, "Juste les POS" pour le rôle 'user').
 */
export function roleGuard(minimum: 'admin' | 'superviseur'): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const allowed = minimum === 'admin' ? authService.isAdmin() : authService.isAtLeastSuperviseur();

    return allowed ? true : router.createUrlTree(['/pos-vente']);
  };
}
