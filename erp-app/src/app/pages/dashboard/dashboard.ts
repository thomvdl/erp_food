import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BookingService } from '../../core/booking.service';
import { EventDateService } from '../../core/event-date.service';
import { ProductService } from '../../core/product.service';
import { TicketService } from '../../core/ticket.service';
import { ReportService } from '../../core/report.service';
import { Booking, BookingType } from '../../core/models/booking.model';
import { EventDate } from '../../core/models/event.model';
import { Ticket } from '../../core/models/ticket.model';
import { ReportPeriodStats } from '../../core/models/report.model';
import { ticketTotal as sharedTicketTotal } from '../../core/ticket-print.util';

const BOOKING_TYPE_LABELS: Record<BookingType, string> = {
  breakfast: 'Petit déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Souper',
};

const RECENT_TICKETS_DISPLAY_LIMIT = 8;
// Fetch plus large que ce qui est affiché, juste pour laisser de la marge à la mini-liste
// "tickets récents" (RECENT_TICKETS_DISPLAY_LIMIT) — la stat "Ventes du jour" ne vient plus de
// cette liste (voir todaySummary/ReportService.summary('jour'), une vraie somme serveur sans
// limite ni écart de fuseau horaire).
const TICKETS_FETCH_LIMIT = 50;
const UPCOMING_EVENT_DATES_LIMIT = 5;

/**
 * Tableau de bord réel (remplace l'ancienne maquette statique de style.css) : stats du jour +
 * mini-listes réservations/événements/tickets, chacune reliée à sa page complète.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly bookingService = inject(BookingService);
  private readonly eventDateService = inject(EventDateService);
  private readonly ticketService = inject(TicketService);
  private readonly productService = inject(ProductService);
  private readonly reportService = inject(ReportService);

  private readonly todayKey = this.todayIso();

  readonly todaysBookings = signal<Booking[]>([]);
  readonly upcomingEventDates = signal<EventDate[]>([]);
  readonly fetchedTickets = signal<Ticket[]>([]);
  readonly activeProductsCount = signal(0);
  /** Voir ReportController::summary('jour') — même source que la page Rapports, pour éviter tout
   *  écart entre les deux écrans (voir Readme.md/discussion : le calcul à partir des 50 derniers
   *  tickets ci-dessous ne comptait ni au-delà de cette limite, ni net de réduction/points, ni sur
   *  la même frontière de journée que le serveur). `fetchedTickets` reste utilisé pour la mini-liste
   *  "tickets récents" seulement, qui n'a pas besoin d'être exhaustive. */
  readonly todaySummary = signal<ReportPeriodStats | null>(null);

  readonly recentTickets = computed(() => this.fetchedTickets().slice(0, RECENT_TICKETS_DISPLAY_LIMIT));

  readonly totalGuestsToday = computed(() =>
    this.todaysBookings().reduce((sum, booking) => sum + booking.number_of_guests, 0),
  );

  readonly salesToday = computed(() => {
    const summary = this.todaySummary();
    return { count: summary?.tickets_count ?? 0, total: summary?.revenue ?? 0 };
  });

  constructor() {
    this.bookingService.list(this.todayKey).subscribe((bookings) => this.todaysBookings.set(bookings));

    this.eventDateService.list().subscribe((dates) => {
      const upcoming = dates
        .filter((eventDate) => eventDate.date.slice(0, 10) >= this.todayKey)
        .sort((a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)) || a.start_hour.localeCompare(b.start_hour));
      this.upcomingEventDates.set(upcoming.slice(0, UPCOMING_EVENT_DATES_LIMIT));
    });

    this.ticketService.list(TICKETS_FETCH_LIMIT).subscribe((tickets) => this.fetchedTickets.set(tickets));

    this.reportService.summary('jour').subscribe((summary) => this.todaySummary.set(summary.current));

    this.productService.list().subscribe((products) => this.activeProductsCount.set(products.filter((p) => p.active).length));
  }

  bookingTypeLabel(type: BookingType): string {
    return BOOKING_TYPE_LABELS[type];
  }

  formatHour(value: string): string {
    return value.slice(0, 5);
  }

  formatEventDate(eventDate: EventDate): string {
    const [year, month, day] = eventDate.date.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }

  formatTicketTime(ticket: Ticket): string {
    return new Date(ticket.paid_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  ticketTotal(ticket: Ticket): number {
    return sharedTicketTotal(ticket);
  }

  formatPrice(value: number): string {
    return value.toFixed(2) + ' €';
  }

  private todayIso(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
