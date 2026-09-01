import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TicketService } from '../../../core/ticket.service';
import { Ticket } from '../../../core/models/ticket.model';
import { DatePicker } from '../../../shared/date-picker/date-picker';
import { formatMoney, formatTicketDate, ticketNetTotal, ticketSourceLabel } from '../../../core/ticket-print.util';

/** Combien de tickets rapatrier — pas de pagination côté backend (voir TicketController::index), une grosse limite suffit pour une liste tenue en mémoire côté client (même approche que les autres pages de liste de ce projet). */
const TICKETS_FETCH_LIMIT = 1000;

type SortField = 'id' | 'date' | 'source' | 'table' | 'client' | 'payment' | 'total';
type SortDir = 'asc' | 'desc';

/**
 * "Ajouter une section -> Gestion des tickets, historique des tickets -> possibilité de
 * réimpression de ticket (pas de modification et de suppression)" (voir Readme.md) — un ticket
 * payé est une pièce comptable figée, volontairement en lecture seule ici : ni édition, ni
 * suppression, uniquement consultation (lien "Voir" vers ticket-detail.ts, qui porte lui-même le
 * bouton de réimpression — pas dupliqué ici).
 */
@Component({
  selector: 'app-ticket-list',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePicker],
  templateUrl: './ticket-list.html',
})
export class TicketList {
  private readonly ticketService = inject(TicketService);

  readonly tickets = signal<Ticket[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly dayFilter = signal<string | null>(null);
  readonly clientFilter = signal('');

  // Le plus récent en premier par défaut, cohérent avec l'ordre déjà renvoyé par
  // TicketController::index (->latest('paid_at')).
  readonly sortField = signal<SortField>('date');
  readonly sortDir = signal<SortDir>('desc');

  readonly formatMoney = formatMoney;
  readonly formatTicketDate = formatTicketDate;
  readonly ticketTotal = ticketNetTotal;
  readonly ticketSourceLabel = ticketSourceLabel;

  readonly filteredTickets = computed(() => {
    const day = this.dayFilter();
    const clientQuery = this.clientFilter().trim().toLowerCase();
    const field = this.sortField();
    const dir = this.sortDir() === 'asc' ? 1 : -1;

    const filtered = this.tickets().filter((ticket) => {
      const matchesDay = !day || ticket.paid_at.slice(0, 10) === day;
      const clientName = ticket.client ? `${ticket.client.firstname} ${ticket.client.lastname}`.toLowerCase() : '';
      const matchesClient = !clientQuery || clientName.includes(clientQuery);
      return matchesDay && matchesClient;
    });

    return [...filtered].sort((a, b) => this.compare(a, b, field) * dir);
  });

  constructor() {
    this.refresh();
  }

  resetFilters(): void {
    this.dayFilter.set(null);
    this.clientFilter.set('');
  }

  clientLabel(ticket: Ticket): string {
    return ticket.client ? `${ticket.client.firstname} ${ticket.client.lastname}` : 'Client comptant';
  }

  paymentSummary(ticket: Ticket): string {
    return ticket.payments.map((payment) => payment.payment_method?.name).filter(Boolean).join(', ');
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

  private compare(a: Ticket, b: Ticket, field: SortField): number {
    switch (field) {
      case 'id':
        return a.id - b.id;
      case 'source':
        return this.ticketSourceLabel(a).localeCompare(this.ticketSourceLabel(b));
      case 'table':
        return (a.table?.label ?? a.table_number ?? '').localeCompare(b.table?.label ?? b.table_number ?? '');
      case 'client':
        return this.clientLabel(a).localeCompare(this.clientLabel(b));
      case 'payment':
        return this.paymentSummary(a).localeCompare(this.paymentSummary(b));
      case 'total':
        return this.ticketTotal(a) - this.ticketTotal(b);
      default:
        return a.paid_at.localeCompare(b.paid_at);
    }
  }

  private refresh(): void {
    this.ticketService.list(TICKETS_FETCH_LIMIT).subscribe({
      next: (tickets) => {
        this.tickets.set(tickets);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Impossible de charger les tickets.');
      },
    });
  }
}
