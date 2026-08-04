import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

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
