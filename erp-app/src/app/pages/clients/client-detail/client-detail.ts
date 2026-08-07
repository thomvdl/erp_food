import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ClientService } from '../../../core/client.service';
import { ClientDetail as ClientDetailModel, ClientPointMovement } from '../../../core/models/client-detail.model';
import { Booking, BookingType } from '../../../core/models/booking.model';
import { EventTicket } from '../../../core/models/event.model';
import { Ticket } from '../../../core/models/ticket.model';
import { formatMoney, formatTicketDate, ticketNetTotal, ticketSourceLabel } from '../../../core/ticket-print.util';

/**
 * Fiche client 360° (voir Readme.md) : consultation uniquement, comme ticket-detail.ts dont ce
 * composant reprend la structure (chargement par id de route dans le constructeur, signaux
 * client/loading/error). Regroupe l'historique déjà éparpillé entre plusieurs pages (tickets,
 * réservations, billets d'événement) et le solde/l'historique de points fidélité (voir
 * App\Support\LoyaltyPoints côté API) — un seul appel à ClientController::show (déjà eager-chargé
 * côté serveur), pas de N+1 de requêtes ici.
 */
@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './client-detail.html',
})
export class ClientDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly clientService = inject(ClientService);

  readonly client = signal<ClientDetailModel | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly formatMoney = formatMoney;
  readonly formatTicketDate = formatTicketDate;
  readonly ticketTotal = ticketNetTotal;
  readonly ticketSourceLabel = ticketSourceLabel;

  private static readonly BOOKING_TYPE_LABELS: Record<BookingType, string> = {
    breakfast: 'Petit-déjeuner',
    lunch: 'Déjeuner',
    dinner: 'Souper',
  };

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.clientService.getDetail(id).subscribe({
      next: (client) => {
        this.client.set(client);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Client introuvable.');
      },
    });
  }

  pointsValue(points: number): string {
    return this.formatMoney(points * 0.05);
  }

  bookingTypeLabel(booking: Booking): string {
    return ClientDetail.BOOKING_TYPE_LABELS[booking.type];
  }

  movementLabel(movement: ClientPointMovement): string {
    return movement.points > 0 ? `+${movement.points}` : `${movement.points}`;
  }

  ticketLabel(ticket: Ticket): string {
    return `${this.formatTicketDate(ticket.paid_at)} — ${this.ticketSourceLabel(ticket)}`;
  }

  eventTicketLabel(eventTicket: EventTicket): string {
    return eventTicket.event_date?.event?.name ?? 'Événement';
  }
}
