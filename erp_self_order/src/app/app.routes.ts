import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.Home) },
  { path: 'kiosk/login', loadComponent: () => import('./pages/kiosk-login/kiosk-login').then((m) => m.KioskLogin) },
  {
    path: 'kiosk/setup',
    loadComponent: () => import('./pages/kiosk-setup/kiosk-setup').then((m) => m.KioskSetup),
    canActivate: [authGuard],
  },
  {
    path: 'kiosk',
    loadComponent: () => import('./pages/kiosk-order/kiosk-order').then((m) => m.KioskOrder),
    canActivate: [authGuard],
  },
  // Route générique en dernier : capte tout token de QR de table restant (voir SelfOrderController).
  { path: ':qrToken', loadComponent: () => import('./pages/order/order').then((m) => m.Order) },
];
