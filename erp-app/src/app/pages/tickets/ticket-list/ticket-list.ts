import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TicketService } from '../../../core/ticket.service';
import { Ticket } from '../../../core/models/ticket.model';
import { DatePicker } from '../../../shared/date-picker/date-picker';
import { TicketReceipt } from '../../../shared/ticket-receipt/ticket-receipt';
import { formatMoney, formatTicketDate, ticketSourceLabel, ticketTotal } from '../../../core/ticket-print.util';

/** Combien de tickets rapatrier — pas de pagination côté backend (voir TicketController::index), une grosse limite suffit pour une liste tenue en mémoire côté client (même approche que les autres pages de liste de ce projet). */
const TICKETS_FETCH_LIMIT = 1000;

/**
 * "Ajouter une section -> Gestion des tickets, historique des tickets -> possibilité de
 * réimpression de ticket (pas de modification et de suppression)" (voir Readme.md) — un ticket
 * payé est une pièce comptable figée, volontairement en lecture seule ici : ni édition, ni
 * suppression, uniquement consultation (lien "Voir" vers ticket-detail.ts) et réimpression du
 * reçu directement depuis la liste.
 */
@Component({
  selector: 'app-ticket-list',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePicker, TicketReceipt],
  templateUrl: './ticket-list.html',
})
export class TicketList {
  private readonly ticketService = inject(TicketService);

  readonly tickets = signal<Ticket[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly dayFilter = signal<string | null>(null);
  readonly clientFilter = signal('');

  readonly printingTicket = signal<Ticket | null>(null);

  readonly formatMoney = formatMoney;
  readonly formatTicketDate = formatTicketDate;
  readonly ticketTotal = ticketTotal;
  readonly ticketSourceLabel = ticketSourceLabel;

  readonly filteredTickets = computed(() => {
    const day = this.dayFilter();
    const clientQuery = this.clientFilter().trim().toLowerCase();

    return this.tickets().filter((ticket) => {
      const matchesDay = !day || ticket.paid_at.slice(0, 10) === day;
      const clientName = ticket.client ? `${ticket.client.firstname} ${ticket.client.lastname}`.toLowerCase() : '';
      const matchesClient = !clientQuery || clientName.includes(clientQuery);
      return matchesDay && matchesClient;
    });
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

  print(ticket: Ticket): void {
    this.printingTicket.set(ticket);
    // Laisse Angular peindre le bloc .ticket-print avant d'ouvrir la boîte de dialogue d'impression.
    setTimeout(() => window.print(), 50);
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
