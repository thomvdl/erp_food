import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TicketService } from '../../../core/ticket.service';
import { Ticket } from '../../../core/models/ticket.model';
import { TicketReceipt } from '../../../shared/ticket-receipt/ticket-receipt';
import { formatMoney, formatTicketDate, ticketTotal } from '../../../core/ticket-print.util';

/**
 * Détail d'un ticket (voir Readme.md — Gestion des tickets) : consultation et réimpression
 * uniquement, comme la liste. Pas d'édition ni de suppression, un ticket payé est figé.
 */
@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [RouterLink, TicketReceipt],
  templateUrl: './ticket-detail.html',
})
export class TicketDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly ticketService = inject(TicketService);

  readonly ticket = signal<Ticket | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly formatMoney = formatMoney;
  readonly formatTicketDate = formatTicketDate;
  readonly ticketTotal = ticketTotal;

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.ticketService.get(id).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Ticket introuvable.');
      },
    });
  }

  clientLabel(ticket: Ticket): string {
    return ticket.client ? `${ticket.client.firstname} ${ticket.client.lastname}` : 'Client comptant';
  }

  paymentSummary(ticket: Ticket): string {
    return ticket.payments.map((payment) => payment.payment_method?.name).filter(Boolean).join(', ');
  }

  print(): void {
    window.print();
  }
}
