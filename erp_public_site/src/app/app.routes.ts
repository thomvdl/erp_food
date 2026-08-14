import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.Home) },
      { path: 'reservation', loadComponent: () => import('./pages/booking/booking').then((m) => m.Booking) },
      { path: 'evenements', loadComponent: () => import('./pages/events/events').then((m) => m.Events) },
    ],
  },
];
