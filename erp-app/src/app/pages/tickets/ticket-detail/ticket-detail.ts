import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TicketService } from '../../../core/ticket.service';
import { Ticket } from '../../../core/models/ticket.model';
import { TicketReceipt } from '../../../shared/ticket-receipt/ticket-receipt';
import { formatMoney, formatTicketDate, ticketSourceLabel, ticketTotal } from '../../../core/ticket-print.util';

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

  readonly sendingEmail = signal(false);
  readonly emailSent = signal(false);

  readonly printingThermal = signal(false);
  readonly thermalPrinted = signal(false);

  readonly formatMoney = formatMoney;
  readonly formatTicketDate = formatTicketDate;
  readonly ticketTotal = ticketTotal;
  readonly ticketSourceLabel = ticketSourceLabel;

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

  sendEmail(): void {
    const ticket = this.ticket();
    if (!ticket || this.sendingEmail()) {
      return;
    }

    this.sendingEmail.set(true);
    this.error.set(null);
    this.ticketService.sendEmail(ticket.id).subscribe({
      next: () => {
        this.sendingEmail.set(false);
        this.emailSent.set(true);
      },
      error: () => {
        this.sendingEmail.set(false);
        this.error.set("Impossible d'envoyer le ticket par email.");
      },
    });
  }

  printThermal(): void {
    const ticket = this.ticket();
    if (!ticket || this.printingThermal()) {
      return;
    }

    this.printingThermal.set(true);
    this.error.set(null);
    this.ticketService.printThermal(ticket.id).subscribe({
      next: () => {
        this.printingThermal.set(false);
        this.thermalPrinted.set(true);
      },
      error: (err) => {
        this.printingThermal.set(false);
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.error.set((messages?.length ? messages.join(' ') : err.error?.message) ?? "Impossible d'imprimer sur l'imprimante thermique.");
      },
    });
  }
}
