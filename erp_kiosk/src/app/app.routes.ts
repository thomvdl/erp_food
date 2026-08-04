import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/kiosk-login/kiosk-login').then((m) => m.KioskLogin) },
  {
    path: 'setup',
    loadComponent: () => import('./pages/kiosk-setup/kiosk-setup').then((m) => m.KioskSetup),
    canActivate: [authGuard],
  },
  // Public — écran "suivi des commandes" (voir order-status.ts), pensé pour un moniteur près du
  // comptoir, pas d'authentification.
  { path: 'suivi', loadComponent: () => import('./pages/order-status/order-status').then((m) => m.OrderStatus) },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/kiosk-order/kiosk-order').then((m) => m.KioskOrder),
    canActivate: [authGuard],
  },
];
