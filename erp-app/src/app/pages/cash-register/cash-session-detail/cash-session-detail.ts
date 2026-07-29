import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CashSessionService } from '../../../core/cash-session.service';
import { CashSession } from '../../../core/models/cash-session.model';
import { TicketPayment } from '../../../core/models/ticket.model';

interface PaymentMethodTotal {
  name: string;
  total: number;
}

/**
 * Détail d'une session de caisse : liste des paiements qui lui sont rattachés, chacun attribué
 * à l'utilisateur qui l'a encaissé — c'est la vue "valider les paiements par utilisateur" (voir
 * Readme.md). Fonctionne aussi bien pour une session encore ouverte que déjà fermée.
 */
@Component({
  selector: 'app-cash-session-detail',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './cash-session-detail.html',
})
export class CashSessionDetail {
  private readonly cashSessionService = inject(CashSessionService);
  private readonly route = inject(ActivatedRoute);

  readonly session = signal<CashSession | null>(null);
  readonly payments = signal<TicketPayment[]>([]);

  readonly totalsByMethod = computed<PaymentMethodTotal[]>(() => {
    const totals = new Map<string, number>();
    for (const payment of this.payments()) {
      const name = payment.payment_method?.name ?? '—';
      totals.set(name, (totals.get(name) ?? 0) + Number(payment.value));
    }
    return [...totals.entries()].map(([name, total]) => ({ name, total }));
  });

  readonly grandTotal = computed(() => this.payments().reduce((sum, payment) => sum + Number(payment.value), 0));

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.cashSessionService.get(id).subscribe((session) => {
      this.session.set(session);
      this.payments.set(session.payments ?? []);
    });
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
}
