import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    // Affiché juste après la connexion (voir login.ts) — choix du poste/passe avant le board.
    path: 'poste',
    loadComponent: () => import('./pages/poste-select/poste-select').then((m) => m.PosteSelect),
    canActivate: [authGuard],
  },
  {
    path: '',
    loadComponent: () => import('./pages/kitchen-board/kitchen-board').then((m) => m.KitchenBoard),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: '' },
];
