import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

// Catalogue parcourable librement en anonyme (voir shared/customer-login, qui propose "Se
// connecter" sans y forcer) — la connexion (voir core/auth.guard.ts) n'est exigée qu'à partir du
// checkout, seul moment où elle est réellement nécessaire ("commander"). 'connexion' et
// 'auth/google/callback' restent hors garde, ce sont les pages du parcours de connexion lui-même.
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/catalog/catalog').then((m) => m.Catalog) },
  { path: 'checkout', canActivate: [authGuard], loadComponent: () => import('./pages/checkout/checkout').then((m) => m.Checkout) },
  // Retour de Stripe Checkout (voir ShopCheckoutController::store, success_url/cancel_url).
  {
    path: 'confirmation',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/confirmation/confirmation').then((m) => m.Confirmation),
  },
  { path: 'mon-compte', canActivate: [authGuard], loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard) },
  { path: 'connexion', loadComponent: () => import('./pages/login/login').then((m) => m.Login) },
  { path: 'auth/google/callback', loadComponent: () => import('./pages/auth-callback/auth-callback').then((m) => m.AuthCallback) },
];
