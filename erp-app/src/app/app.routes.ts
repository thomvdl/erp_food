import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'parametres',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./pages/parametres/parametres-home/parametres-home').then((m) => m.ParametresHome),
          },
          {
            path: 'categories',
            loadComponent: () =>
              import('./pages/parametres/categories/category-list/category-list').then((m) => m.CategoryList),
          },
          {
            path: 'categories/nouveau',
            loadComponent: () =>
              import('./pages/parametres/categories/category-form/category-form').then((m) => m.CategoryForm),
          },
          {
            path: 'categories/:id',
            loadComponent: () =>
              import('./pages/parametres/categories/category-form/category-form').then((m) => m.CategoryForm),
          },
          {
            path: 'catalogues',
            loadComponent: () =>
              import('./pages/parametres/catalogs/catalog-list/catalog-list').then((m) => m.CatalogList),
          },
          {
            path: 'catalogues/nouveau',
            loadComponent: () =>
              import('./pages/parametres/catalogs/catalog-form/catalog-form').then((m) => m.CatalogForm),
          },
          {
            path: 'catalogues/:id',
            loadComponent: () =>
              import('./pages/parametres/catalogs/catalog-form/catalog-form').then((m) => m.CatalogForm),
          },
          {
            path: 'roles',
            loadComponent: () => import('./pages/parametres/roles/role-list/role-list').then((m) => m.RoleList),
          },
          {
            path: 'roles/nouveau',
            loadComponent: () => import('./pages/parametres/roles/role-form/role-form').then((m) => m.RoleForm),
          },
          {
            path: 'roles/:id',
            loadComponent: () => import('./pages/parametres/roles/role-form/role-form').then((m) => m.RoleForm),
          },
          {
            path: 'utilisateurs',
            loadComponent: () => import('./pages/parametres/users/user-list/user-list').then((m) => m.UserList),
          },
          {
            path: 'utilisateurs/nouveau',
            loadComponent: () => import('./pages/parametres/users/user-form/user-form').then((m) => m.UserForm),
          },
          {
            path: 'utilisateurs/:id',
            loadComponent: () => import('./pages/parametres/users/user-form/user-form').then((m) => m.UserForm),
          },
          {
            path: 'salles',
            loadComponent: () => import('./pages/parametres/rooms/room-list/room-list').then((m) => m.RoomList),
          },
          {
            path: 'salles/nouveau',
            loadComponent: () => import('./pages/parametres/rooms/room-form/room-form').then((m) => m.RoomForm),
          },
          {
            path: 'salles/:id',
            loadComponent: () => import('./pages/parametres/rooms/room-form/room-form').then((m) => m.RoomForm),
          },
          {
            path: 'salles/:id/plan',
            loadComponent: () =>
              import('./pages/parametres/rooms/floor-plan-editor/floor-plan-editor').then((m) => m.FloorPlanEditor),
          },
          {
            path: 'stations',
            loadComponent: () =>
              import('./pages/parametres/stations/station-list/station-list').then((m) => m.StationList),
          },
          {
            path: 'stations/nouveau',
            loadComponent: () =>
              import('./pages/parametres/stations/station-form/station-form').then((m) => m.StationForm),
          },
          {
            path: 'stations/:id',
            loadComponent: () =>
              import('./pages/parametres/stations/station-form/station-form').then((m) => m.StationForm),
          },
          {
            path: 'taxes',
            loadComponent: () => import('./pages/parametres/taxes/tax-list/tax-list').then((m) => m.TaxList),
          },
          {
            path: 'taxes/nouveau',
            loadComponent: () => import('./pages/parametres/taxes/tax-form/tax-form').then((m) => m.TaxForm),
          },
          {
            path: 'taxes/:id',
            loadComponent: () => import('./pages/parametres/taxes/tax-form/tax-form').then((m) => m.TaxForm),
          },
        ],
      },
      {
        path: 'produits',
        children: [
          {
            path: '',
            loadComponent: () => import('./pages/products/product-list/product-list').then((m) => m.ProductList),
          },
          {
            path: 'nouveau',
            loadComponent: () => import('./pages/products/product-form/product-form').then((m) => m.ProductForm),
          },
          {
            path: ':id',
            loadComponent: () => import('./pages/products/product-form/product-form').then((m) => m.ProductForm),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
