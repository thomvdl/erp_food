import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { API_URL } from './api-config';

/**
 * Attache le Bearer token seulement s'il y en a un. Les appels self-order (mode QR, non
 * authentifiés) passent par le même HttpClient — sans token en localStorage, la requête part
 * simplement sans en-tête Authorization, ce qui est exactement ce que veut SelfOrderController
 * (routes publiques). Un 401 ne redirige vers /kiosk/login que si un token était présent (sinon on
 * casserait le mode QR à la moindre 401 imprévue).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const token = authService.token();
  const authReq = token && req.url.startsWith(API_URL) ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authReq).pipe(
    catchError((err) => {
      if (err.status === 401 && token) {
        authService.clearSession();
        router.navigateByUrl('/kiosk/login');
      }
      return throwError(() => err);
    }),
  );
};
