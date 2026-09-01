import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { roleGuard } from './core/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        canActivate: [roleGuard('superviseur')],
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        // Même garde que le Dashboard (voir Readme.md) — page distincte, pas un onglet dessus :
        // le Dashboard reste un coup d'œil "aujourd'hui", les Rapports la comparaison de périodes.
        path: 'rapports',
        canActivate: [roleGuard('superviseur')],
        loadComponent: () => import('./pages/reports/reports').then((m) => m.Reports),
      },
      {
        path: 'parametres',
        canActivate: [roleGuard('admin')],
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
            path: 'bannieres-kiosque',
            loadComponent: () =>
              import('./pages/parametres/kiosk-banners/kiosk-banner-list/kiosk-banner-list').then((m) => m.KioskBannerList),
          },
          {
            path: 'bannieres-kiosque/nouveau',
            loadComponent: () =>
              import('./pages/parametres/kiosk-banners/kiosk-banner-form/kiosk-banner-form').then((m) => m.KioskBannerForm),
          },
          {
            path: 'bannieres-kiosque/:id',
            loadComponent: () =>
              import('./pages/parametres/kiosk-banners/kiosk-banner-form/kiosk-banner-form').then((m) => m.KioskBannerForm),
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
            path: 'salles/:id/tables',
            loadComponent: () => import('./pages/parametres/rooms/table-list/table-list').then((m) => m.TableList),
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
            path: 'passes',
            loadComponent: () => import('./pages/parametres/passes/passe-list/passe-list').then((m) => m.PasseList),
          },
          {
            path: 'passes/nouveau',
            loadComponent: () => import('./pages/parametres/passes/passe-form/passe-form').then((m) => m.PasseForm),
          },
          {
            path: 'passes/:id',
            loadComponent: () => import('./pages/parametres/passes/passe-form/passe-form').then((m) => m.PasseForm),
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
          {
            path: 'reductions',
            loadComponent: () => import('./pages/parametres/discounts/discount-list/discount-list').then((m) => m.DiscountList),
          },
          {
            path: 'reductions/nouveau',
            loadComponent: () => import('./pages/parametres/discounts/discount-form/discount-form').then((m) => m.DiscountForm),
          },
          {
            path: 'reductions/:id',
            loadComponent: () => import('./pages/parametres/discounts/discount-form/discount-form').then((m) => m.DiscountForm),
          },
          {
            path: 'ingredients',
            loadComponent: () =>
              import('./pages/parametres/ingredients/ingredient-list/ingredient-list').then((m) => m.IngredientList),
          },
          {
            path: 'ingredients/nouveau',
            loadComponent: () =>
              import('./pages/parametres/ingredients/ingredient-form/ingredient-form').then((m) => m.IngredientForm),
          },
          {
            path: 'ingredients/:id',
            loadComponent: () =>
              import('./pages/parametres/ingredients/ingredient-form/ingredient-form').then((m) => m.IngredientForm),
          },
          {
            path: 'types-place',
            loadComponent: () =>
              import('./pages/parametres/ticket-types/ticket-type-list/ticket-type-list').then((m) => m.TicketTypeList),
          },
          {
            path: 'types-place/nouveau',
            loadComponent: () =>
              import('./pages/parametres/ticket-types/ticket-type-form/ticket-type-form').then((m) => m.TicketTypeForm),
          },
          {
            path: 'types-place/:id',
            loadComponent: () =>
              import('./pages/parametres/ticket-types/ticket-type-form/ticket-type-form').then((m) => m.TicketTypeForm),
          },
          {
            path: 'imprimantes',
            loadComponent: () => import('./pages/parametres/printers/printer-list/printer-list').then((m) => m.PrinterList),
          },
          {
            path: 'imprimantes/nouveau',
            loadComponent: () => import('./pages/parametres/printers/printer-form/printer-form').then((m) => m.PrinterForm),
          },
          {
            path: 'imprimantes/:id',
            loadComponent: () => import('./pages/parametres/printers/printer-form/printer-form').then((m) => m.PrinterForm),
          },
          {
            path: 'reglages',
            loadComponent: () => import('./pages/parametres/params/param-list/param-list').then((m) => m.ParamList),
          },
          {
            path: 'reglages/nouveau',
            loadComponent: () => import('./pages/parametres/params/param-form/param-form').then((m) => m.ParamForm),
          },
          {
            path: 'reglages/:id',
            loadComponent: () => import('./pages/parametres/params/param-form/param-form').then((m) => m.ParamForm),
          },
        ],
      },
      {
        // Hub qui regroupe les anciennes entrées "Gestion des ..." de la sidebar (voir shell.ts)
        // pour l'épurer — pas de garde ici contrairement à `parametres` : les routes enfants
        // (commandes/evenements/tickets/produits/clients) gardent chacune leur propre garde
        // existante, pas uniformes (ex. commandes reste accessible à tous les rôles).
        path: 'gestion',
        children: [
          {
            path: '',
            loadComponent: () => import('./pages/gestion/gestion-home/gestion-home').then((m) => m.GestionHome),
          },
          {
            path: 'commandes',
            loadComponent: () => import('./pages/orders/order-list/order-list').then((m) => m.OrderList),
          },
          {
            path: 'livraison',
            children: [
              {
                path: '',
                loadComponent: () => import('./pages/orders/delivery-list/delivery-list').then((m) => m.DeliveryList),
              },
              {
                path: ':id',
                loadComponent: () => import('./pages/orders/delivery-detail/delivery-detail').then((m) => m.DeliveryDetail),
              },
            ],
          },
          {
            path: 'produits',
            canActivate: [roleGuard('superviseur')],
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
          {
            path: 'clients',
            canActivate: [roleGuard('superviseur')],
            children: [
              {
                path: '',
                loadComponent: () => import('./pages/clients/client-list/client-list').then((m) => m.ClientList),
              },
              {
                path: 'nouveau',
                loadComponent: () => import('./pages/clients/client-form/client-form').then((m) => m.ClientForm),
              },
              {
                path: ':id',
                loadComponent: () => import('./pages/clients/client-detail/client-detail').then((m) => m.ClientDetail),
              },
              {
                path: ':id/modifier',
                loadComponent: () => import('./pages/clients/client-form/client-form').then((m) => m.ClientForm),
              },
            ],
          },
          {
            path: 'evenements',
            children: [
              {
                path: '',
                canActivate: [roleGuard('superviseur')],
                loadComponent: () => import('./pages/events/event-list/event-list').then((m) => m.EventList),
              },
              {
                path: 'nouveau',
                canActivate: [roleGuard('superviseur')],
                loadComponent: () => import('./pages/events/event-form/event-form').then((m) => m.EventForm),
              },
              {
                path: ':id/modifier',
                canActivate: [roleGuard('superviseur')],
                loadComponent: () => import('./pages/events/event-form/event-form').then((m) => m.EventForm),
              },
              {
                path: ':id',
                canActivate: [roleGuard('superviseur')],
                loadComponent: () => import('./pages/events/event-detail/event-detail').then((m) => m.EventDetail),
              },
            ],
          },
          {
            path: 'tickets',
            canActivate: [roleGuard('superviseur')],
            children: [
              {
                path: '',
                loadComponent: () => import('./pages/tickets/ticket-list/ticket-list').then((m) => m.TicketList),
              },
              {
                path: ':id',
                loadComponent: () => import('./pages/tickets/ticket-detail/ticket-detail').then((m) => m.TicketDetail),
              },
            ],
          },
        ],
      },
      {
        path: 'pos-vente',
        loadComponent: () => import('./pages/pos-vente/pos-vente').then((m) => m.PosVente),
      },
      {
        path: 'pos-restaurant',
        children: [
          {
            path: '',
            loadComponent: () => import('./pages/pos-restaurant/table-select/table-select').then((m) => m.TableSelect),
          },
          {
            path: ':orderId',
            loadComponent: () => import('./pages/pos-restaurant/order-builder/order-builder').then((m) => m.OrderBuilder),
          },
        ],
      },
      {
        // Route de premier niveau, séparée de 'gestion/evenements' (voir Readme.md) : ouverte à tous les
        // rôles, contrairement à la gestion des événements (superviseur+) — les deux ont toujours
        // été deux entrées distinctes dans la sidebar (voir shell.ts). Le dashboard de vente/
        // validation (:id/dates/:dateId) vit ici, PAS sous gestion/evenements : un seul point
        // d'entrée pour vendre une place, plus de double emploi entre les deux sections.
        path: 'vente-de-places',
        children: [
          {
            path: '',
            loadComponent: () => import('./pages/events/event-date-select/event-date-select').then((m) => m.EventDateSelect),
          },
          {
            path: ':id/dates/:dateId',
            loadComponent: () => import('./pages/events/event-dashboard/event-dashboard').then((m) => m.EventDashboard),
          },
        ],
      },
      {
        path: 'caisse',
        canActivate: [roleGuard('superviseur')],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./pages/cash-register/cash-register-home/cash-register-home').then((m) => m.CashRegisterHome),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./pages/cash-register/cash-session-detail/cash-session-detail').then((m) => m.CashSessionDetail),
          },
        ],
      },
      {
        path: 'reservations',
        children: [
          {
            path: '',
            loadComponent: () => import('./pages/bookings/booking-list/booking-list').then((m) => m.BookingList),
          },
          {
            path: 'nouveau',
            loadComponent: () => import('./pages/bookings/booking-form/booking-form').then((m) => m.BookingForm),
          },
          {
            path: ':id',
            loadComponent: () => import('./pages/bookings/booking-form/booking-form').then((m) => m.BookingForm),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
