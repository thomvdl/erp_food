import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CustomerSessionService } from './customer-session.service';

/**
 * Connexion obligatoire dès l'arrivée sur le site (voir app.routes.ts) — redirige vers /connexion
 * en mémorisant l'URL visée (`returnUrl`, lue par pages/login) plutôt que de bloquer sur place :
 * `CustomerSessionService.customer` est restauré de façon synchrone depuis localStorage (voir son
 * constructeur), donc pas besoin d'attendre quoi que ce soit ici.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const session = inject(CustomerSessionService);
  const router = inject(Router);

  if (session.customer()) return true;

  return router.createUrlTree(['/connexion'], { queryParams: { returnUrl: state.url } });
};
