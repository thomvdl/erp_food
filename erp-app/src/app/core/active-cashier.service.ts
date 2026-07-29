import { Injectable, inject, signal } from '@angular/core';
import { CashSessionService } from './cash-session.service';
import { UserService } from './user.service';
import { CashSession } from './models/cash-session.model';
import { User } from './models/user.model';

const CASHIER_KEY = 'erp-v2-cashier-user-id';

/**
 * Pas d'auth dans ce projet — "l'utilisateur courant" pour la caisse est choisi manuellement
 * (persisté en localStorage pour survivre à un rechargement de page/kiosque) plutôt que déduit
 * d'une session serveur. Service partagé (providedIn: 'root') entre le module Caisse (qui
 * ouvre/ferme la session) et le POS (qui a juste besoin de savoir à quelle session rattacher
 * les paiements, voir CreateTicketPayload.cash_session_id).
 */
@Injectable({ providedIn: 'root' })
export class ActiveCashierService {
  private readonly cashSessionService = inject(CashSessionService);
  private readonly userService = inject(UserService);

  readonly cashier = signal<User | null>(null);
  readonly activeSession = signal<CashSession | null>(null);
  readonly loaded = signal(false);

  constructor() {
    const storedId = this.readStoredCashierId();
    if (storedId === null) {
      this.loaded.set(true);
      return;
    }

    this.userService.list().subscribe((users) => {
      const user = users.find((u) => u.id === storedId) ?? null;
      this.cashier.set(user);
      this.loaded.set(true);
      if (user) {
        this.refreshActiveSession();
      }
    });
  }

  setCashier(user: User | null): void {
    this.cashier.set(user);

    if (user) {
      localStorage.setItem(CASHIER_KEY, String(user.id));
      this.refreshActiveSession();
    } else {
      localStorage.removeItem(CASHIER_KEY);
      this.activeSession.set(null);
    }
  }

  refreshActiveSession(): void {
    const user = this.cashier();
    if (!user) {
      this.activeSession.set(null);
      return;
    }

    this.cashSessionService.active(user.id).subscribe((session) => this.activeSession.set(session));
  }

  private readStoredCashierId(): number | null {
    const stored = localStorage.getItem(CASHIER_KEY);
    return stored ? Number(stored) : null;
  }
}
