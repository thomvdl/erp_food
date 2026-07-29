import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

/** Posé sur la route racine (Shell) : couvre toutes les pages de l'app en un seul endroit.
 *  Si un token est stocké mais pas encore vérifié (ex. rechargement de page), on le valide via
 *  /auth/me avant de laisser passer — évite de flasher l'app puis de rediriger si le token a
 *  expiré côté serveur. */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.currentUser()) {
    return true;
  }

  if (!authService.token()) {
    return router.createUrlTree(['/login']);
  }

  return authService.fetchMe().pipe(
    map(() => true),
    catchError(() => of(router.createUrlTree(['/login']))),
  );
};
