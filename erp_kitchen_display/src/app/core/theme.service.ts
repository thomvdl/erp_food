import { Injectable, signal } from '@angular/core';

const THEME_KEY = 'erp-v2-theme';

/** Même mécanisme que erp-app/layout/shell/shell.ts (toggleTheme/isDark) — dupliqué plutôt que
 *  partagé, deux workspaces Angular séparés. Service plutôt que logique dans un composant de
 *  page : cette app n'a pas de shell persistant par page, mais un composant racine (App) qui
 *  enveloppe tout via <router-outlet>, donc un seul point d'init suffit. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isDark = signal(this.resolveInitialIsDark());

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
