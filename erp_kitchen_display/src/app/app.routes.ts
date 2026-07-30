import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: '',
    loadComponent: () => import('./pages/kitchen-board/kitchen-board').then((m) => m.KitchenBoard),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: '' },
];
