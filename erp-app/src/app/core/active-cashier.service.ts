import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { CashSessionService } from './cash-session.service';
import { UserService } from './user.service';
import { CashSession } from './models/cash-session.model';
import { User } from './models/user.model';

const CASHIER_KEY = 'erp-v2-cashier-user-id';

/**
 * "L'utilisateur courant" pour la caisse est choisi manuellement (persisté en localStorage pour
 * survivre à un rechargement de page/kiosque) plutôt que déduit directement de l'utilisateur
 * authentifié (Sanctum, voir AuthService) — pensé pour un poste partagé où plusieurs membres du
 * personnel se relaient sans se déconnecter/reconnecter à chaque fois. Service partagé
 * (providedIn: 'root') entre le module Caisse (qui ouvre/ferme la session) et le POS (qui a
 * juste besoin de savoir à quelle session rattacher les paiements, voir
 * CreateTicketPayload.cash_session_id).
 *
 * Ce choix étant local à CE navigateur/appareil (localStorage), un même utilisateur connecté
 * depuis un second appareil (ex. tablette) n'a par défaut aucun caissier sélectionné dessus,
 * même si sa session de caisse est déjà ouverte côté serveur — d'où le fallback ci-dessous sur
 * l'utilisateur authentifié quand rien n'est encore choisi sur cet appareil : le cas le plus
 * courant (la personne connectée est celle qui encaisse) marche du premier coup, et reste
 * modifiable manuellement pour le cas du poste réellement partagé entre plusieurs personnes.
 */
@Injectable({ providedIn: 'root' })
export class ActiveCashierService {
  private readonly cashSessionService = inject(CashSessionService);
  private readonly userService = inject(UserService);
  private readonly authService = inject(AuthService);

  readonly cashier = signal<User | null>(null);
  readonly activeSession = signal<CashSession | null>(null);
  readonly loaded = signal(false);

  constructor() {
    const storedId = this.readStoredCashierId();

    this.userService.list().subscribe((users) => {
      const targetId = storedId ?? this.authService.currentUser()?.id ?? null;
      const user = users.find((u) => u.id === targetId) ?? null;
      this.cashier.set(user);
      this.loaded.set(true);

      if (user) {
        // Pas de sélection locale préexistante : on vient de déduire ce caissier de
        // l'utilisateur connecté — le mémoriser pour cet appareil comme n'importe quel choix
        // manuel (voir setCashier), pour que les prochains chargements le retrouvent direct.
        if (storedId === null) {
          localStorage.setItem(CASHIER_KEY, String(user.id));
        }
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
