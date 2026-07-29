import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: '',
    loadComponent: () => import('./pages/event-select/event-select').then((m) => m.EventSelect),
    canActivate: [authGuard],
  },
  {
    path: 'check-in/:id',
    loadComponent: () => import('./pages/event-checkin/event-checkin').then((m) => m.EventCheckin),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: '' },
];
