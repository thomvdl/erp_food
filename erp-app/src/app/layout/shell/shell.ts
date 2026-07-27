import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface NavItem {
  icon: string;
  label: string;
  path: string;
  exact?: boolean;
}

const COLLAPSED_KEY = 'erp-v2-sidebar-collapsed';
const THEME_KEY = 'erp-v2-theme';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.html',
})
export class Shell {
  protected readonly navItems: NavItem[] = [
    { icon: '🏠', label: 'Dashboard', path: '/', exact: true },
    { icon: '🪑', label: 'POS - Restaurant', path: '/pos-restaurant' },
    { icon: '🏷️​', label: 'POS - Vente directe', path: '/pos-vente' },
    { icon: '🧾', label: 'Commandes', path: '/commandes' },
    { icon: '🍔', label: 'Produits', path: '/produits' },
    { icon: '⚙️', label: 'Paramètres', path: '/parametres' },
  ];

  // Maquette seulement — pas encore d'auth, donc pas d'utilisateur réel à afficher.
  protected readonly currentUser = { name: 'Thomas', role: 'Administrateur', initials: 'TH' };

  readonly collapsed = signal(localStorage.getItem(COLLAPSED_KEY) === 'true');
  readonly isDark = signal(this.resolveInitialIsDark());

  toggleCollapsed(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    localStorage.setItem(COLLAPSED_KEY, String(next));
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
