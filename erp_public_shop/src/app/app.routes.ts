import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/catalog/catalog').then((m) => m.Catalog) },
  { path: 'checkout', loadComponent: () => import('./pages/checkout/checkout').then((m) => m.Checkout) },
  // Retour de Stripe Checkout (voir ShopCheckoutController::store, success_url/cancel_url).
  { path: 'confirmation', loadComponent: () => import('./pages/confirmation/confirmation').then((m) => m.Confirmation) },
  // Compte client optionnel (voir shared/customer-login) — redirige vers l'accueil si personne
  // n'est connecté, voir OrderHistory::constructor().
  { path: 'mes-commandes', loadComponent: () => import('./pages/order-history/order-history').then((m) => m.OrderHistory) },
];
