import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth.service';

interface NavItem {
  icon: string;
  label: string;
  path: string;
  exact?: boolean;
  /** Voir role.guard.ts — absent = accessible à tous les rôles authentifiés (les deux POS). */
  requiredRole?: 'admin' | 'superviseur';
}

const COLLAPSED_KEY = 'erp-v2-sidebar-collapsed';
const THEME_KEY = 'erp-v2-theme';

/** Routes "plein écran" : pas de scroll de page, tout tient dans le viewport avec du scroll
 *  interne (POS Vente directe puis POS Restaurant, demandé explicitement, voir CONTEXT.md).
 *  Comparaison par préfixe (pas égalité stricte) : POS Restaurant a une route enfant dynamique
 *  (/pos-restaurant/:orderId) qui doit aussi matcher. */
const FIXED_LAYOUT_ROUTES = ['/pos-vente', '/pos-restaurant'];

function isFixedLayoutUrl(url: string): boolean {
  return FIXED_LAYOUT_ROUTES.some((route) => url === route || url.startsWith(`${route}/`));
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.html',
})
export class Shell {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  private readonly allNavItems: NavItem[] = [
    { icon: '🏠', label: 'Dashboard', path: '/', exact: true, requiredRole: 'superviseur' },
    { icon: '🪑', label: 'POS - Restaurant', path: '/pos-restaurant' },
    { icon: '🏷️​', label: 'POS - Vente directe', path: '/pos-vente' },
    { icon: '🎫', label: 'Événements', path: '/evenements', requiredRole: 'superviseur' },
    { icon: '🎟️', label: 'Vente de place', path: '/vente-de-places' },
    { icon: '📅', label: 'Réservations', path: '/reservations' },
    { icon: '💶', label: 'Fond de caisse', path: '/caisse', requiredRole: 'superviseur' },
    { icon: '📋', label: 'Gestion des commandes', path: '/commandes' },
    { icon: '🧾', label: 'Gestion des tickets', path: '/tickets', requiredRole: 'superviseur' },
    { icon: '🍔', label: 'Gestion des produits', path: '/produits', requiredRole: 'superviseur' },
    { icon: '👤', label: 'Gestion des clients', path: '/clients', requiredRole: 'superviseur' },
    { icon: '⚙️', label: 'Paramètres', path: '/parametres', requiredRole: 'admin' },
  ];

  /** "Il n'y aura que trois rôles" (voir Readme.md) — même restriction que les routes elles-mêmes
   *  (voir app.routes.ts/role.guard.ts), juste pour ne pas afficher un lien qui redirigerait. */
  protected readonly navItems = computed(() =>
    this.allNavItems.filter((item) => {
      if (item.requiredRole === 'admin') {
        return this.authService.isAdmin();
      }
      if (item.requiredRole === 'superviseur') {
        return this.authService.isAtLeastSuperviseur();
      }
      return true;
    }),
  );

  readonly fixedLayout = signal(isFixedLayoutUrl(this.router.url));

  protected readonly currentUser = computed(() => {
    const user = this.authService.currentUser();
    const name = user?.username ?? '';
    return {
      name,
      role: user?.roles[0]?.name ?? '—',
      initials: name.slice(0, 2).toUpperCase(),
    };
  });

  readonly collapsed = signal(localStorage.getItem(COLLAPSED_KEY) === 'true');
  readonly isDark = signal(this.resolveInitialIsDark());

  constructor() {
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
      this.fixedLayout.set(isFixedLayoutUrl(event.urlAfterRedirects));
    });
  }

  toggleCollapsed(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    localStorage.setItem(COLLAPSED_KEY, String(next));
  }

  logout(): void {
    this.authService.logout().subscribe({
      complete: () => this.router.navigateByUrl('/login'),
      error: () => this.router.navigateByUrl('/login'),
    });
  }

  toggleTheme(): void {
    const next = !this.isDark();
    this.isDark.set(next);
    document.documentElement.dataset['theme'] = next ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
  }

  private resolveInitialIsDark(): boolean {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) {
      document.documentElement.dataset['theme'] = stored;
      return stored === 'dark';
    }

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }
}
