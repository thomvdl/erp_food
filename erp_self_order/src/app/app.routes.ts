import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.Home) },
  // Route générique en dernier : capte tout token de QR de table restant (voir SelfOrderController).
  { path: ':qrToken', loadComponent: () => import('./pages/order/order').then((m) => m.Order) },
];
