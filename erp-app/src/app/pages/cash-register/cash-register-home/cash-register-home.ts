import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ActiveCashierService } from '../../../core/active-cashier.service';
import { CashSessionService } from '../../../core/cash-session.service';
import { PaymentMethodService } from '../../../core/payment-method.service';
import { UserService } from '../../../core/user.service';
import { CashSession } from '../../../core/models/cash-session.model';
import { PaymentMethod } from '../../../core/models/ticket.model';
import { User } from '../../../core/models/user.model';
import { DatePicker } from '../../../shared/date-picker/date-picker';

interface ClosingRow {
  payment_method_id: number;
  name: string;
  expected: number;
  counted: number;
}

type SortField = 'user' | 'opened' | 'closed' | 'opening' | 'closing' | 'discrepancy';
type SortDir = 'asc' | 'desc';

/**
 * Ouverture/fermeture d'un fond de caisse "par utilisateur" (voir Readme.md). Pas d'auth dans ce
 * projet : le "caissier" est choisi manuellement (ActiveCashierService, persisté en
 * localStorage) plutôt que déduit d'une session serveur.
 */
@Component({
  selector: 'app-cash-register-home',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePicker],
  templateUrl: './cash-register-home.html',
})
export class CashRegisterHome {
  private readonly cashSessionService = inject(CashSessionService);
  private readonly userService = inject(UserService);
  private readonly paymentMethodService = inject(PaymentMethodService);
  readonly activeCashierService = inject(ActiveCashierService);

  readonly users = signal<User[]>([]);
  readonly selectedUserId = signal<number | null>(null);
  readonly paymentMethods = signal<PaymentMethod[]>([]);

  readonly openingAmount = signal<number>(0);
  readonly showCloseForm = signal(false);
  readonly closingRows = signal<ClosingRow[]>([]);
  readonly closeResult = signal<CashSession | null>(null);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly sessions = signal<CashSession[]>([]);

  /** Filtre/tri appliqués côté client — pas de filtre par date exposé par
   *  CashSessionService.list() côté backend, et la liste tient facilement en mémoire. */
  readonly historyDayFilter = signal<string | null>(null);
  readonly historyUserFilter = signal<number | null>(null);
  readonly sortField = signal<SortField>('opened');
  readonly sortDir = signal<SortDir>('desc');

  readonly filteredSessions = computed(() => {
    const day = this.historyDayFilter();
    const userId = this.historyUserFilter();
    return this.sessions().filter((session) => {
      const matchesDay = !day || session.opened_at.slice(0, 10) === day;
      const matchesUser = userId === null || session.user_id === userId;
      return matchesDay && matchesUser;
    });
  });

  readonly sortedSessions = computed(() => {
    const field = this.sortField();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return [...this.filteredSessions()].sort((a, b) => this.compareSessions(a, b, field) * dir);
  });

  constructor() {
    this.userService.list().subscribe((users) => this.users.set(users));
    this.paymentMethodService.list().subscribe((methods) => this.paymentMethods.set(methods));
    this.refreshHistory();
  }

  confirmCashier(): void {
    const user = this.users().find((u) => u.id === this.selectedUserId()) ?? null;
    this.activeCashierService.setCashier(user);
    this.closeResult.set(null);
  }

  changeCashier(): void {
    this.activeCashierService.setCashier(null);
    this.selectedUserId.set(null);
    this.closeResult.set(null);
    this.showCloseForm.set(false);
  }

  openSession(): void {
    const user = this.activeCashierService.cashier();
    if (!user) {
      return;
    }

    this.error.set(null);
    this.saving.set(true);

    this.cashSessionService.open({ user_id: user.id, opening_amount: this.openingAmount() }).subscribe({
      next: (session) => {
        this.saving.set(false);
        this.activeCashierService.activeSession.set(session);
        this.openingAmount.set(0);
        this.refreshHistory();
      },
      error: (err) => {
        this.saving.set(false);
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.error.set(messages?.length ? messages.join(' ') : "Impossible d'ouvrir la caisse.");
      },
    });
  }

  /**
   * "Ouvrir pour les espèces, fermer et vérifier tous les moyens de paiement" (voir Readme.md) :
   * une ligne de comptage par moyen de paiement connu, pas seulement les espèces. L'attendu est
   * pré-rempli (espèces = fond d'ouverture + ventes espèces ; les autres = ventes du moyen) —
   * le caissier ajuste si le comptage réel diffère.
   */
  toggleCloseForm(): void {
    const session = this.activeCashierService.activeSession();
    if (!session) {
      return;
    }

    if (this.showCloseForm()) {
      this.showCloseForm.set(false);
      return;
    }

    this.error.set(null);
    this.cashSessionService.get(session.id).subscribe((detail) => {
      const payments = detail.payments ?? [];
      const rows = this.paymentMethods().map((method) => {
        const isCash = method.slug === 'especes';
        const sales = payments
          .filter((payment) => payment.payment_method_id === method.id)
          .reduce((sum, payment) => sum + Number(payment.value), 0);
        const expected = isCash ? Number(session.opening_amount) + sales : sales;
        return { payment_method_id: method.id, name: method.name, expected, counted: expected };
      });
      this.closingRows.set(rows);
      this.showCloseForm.set(true);
    });
  }

  updateCountedAmount(index: number, value: number): void {
    this.closingRows.set(this.closingRows().map((row, i) => (i === index ? { ...row, counted: value } : row)));
  }

  closeSession(): void {
    const session = this.activeCashierService.activeSession();
    if (!session) {
      return;
    }

    this.error.set(null);
    this.saving.set(true);

    const payload = {
      counts: this.closingRows().map((row) => ({ payment_method_id: row.payment_method_id, counted_amount: row.counted })),
    };

    this.cashSessionService.close(session.id, payload).subscribe({
      next: (closed) => {
        this.saving.set(false);
        this.showCloseForm.set(false);
        this.closeResult.set(closed);
        this.activeCashierService.activeSession.set(null);
        this.refreshHistory();
      },
      error: (err) => {
        this.saving.set(false);
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.error.set(messages?.length ? messages.join(' ') : 'Impossible de fermer la caisse.');
      },
    });
  }

  toggleSort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDir.set('asc');
    }
  }

  sortIndicator(field: SortField): string {
    if (this.sortField() !== field) {
      return '';
    }
    return this.sortDir() === 'asc' ? '▲' : '▼';
  }

  private compareSessions(a: CashSession, b: CashSession, field: SortField): number {
    switch (field) {
      case 'user':
        return (a.user?.username ?? '').localeCompare(b.user?.username ?? '');
      case 'closed':
        return (a.closed_at ?? '').localeCompare(b.closed_at ?? '');
      case 'opening':
        return Number(a.opening_amount) - Number(b.opening_amount);
      case 'closing':
        return Number(a.closing_amount ?? 0) - Number(b.closing_amount ?? 0);
      case 'discrepancy':
        return Number(a.discrepancy ?? 0) - Number(b.discrepancy ?? 0);
      default:
        return a.opened_at.localeCompare(b.opened_at);
    }
  }

  hasDiscrepancy(value: number | string | null): boolean {
    return Number(value ?? 0) !== 0;
  }

  formatPrice(value: number | string | null): string {
    if (value === null) {
      return '—';
    }
    return Number(value).toFixed(2) + ' €';
  }

  formatDateTime(value: string | null): string {
    if (!value) {
      return '—';
    }
    return new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  private refreshHistory(): void {
    this.cashSessionService.list().subscribe((sessions) => this.sessions.set(sessions));
  }
}
