import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BookingService } from '../../../core/booking.service';
import { Booking, BookingType } from '../../../core/models/booking.model';
import { DatePicker } from '../../../shared/date-picker/date-picker';

type SortField = 'hour' | 'type' | 'guests' | 'client';
type SortDir = 'asc' | 'desc';

const TYPE_LABELS: Record<BookingType, string> = {
  breakfast: 'Petit déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Souper',
};

@Component({
  selector: 'app-booking-list',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePicker],
  templateUrl: './booking-list.html',
})
export class BookingList {
  private readonly bookingService = inject(BookingService);

  readonly bookings = signal<Booking[]>([]);

  /** null = toutes les dates confondues ; sinon filtre "AAAA-MM-JJ" (voir Readme.md :
   *  "Liste des reservation avec tri et filtre par jour"). Défaut : aujourd'hui. */
  readonly dayFilter = signal<string | null>(this.todayIso());

  /** null = tous les types confondus. Filtré côté client (contrairement au jour, filtré côté
   *  backend) — la liste est déjà chargée pour un jour donné, pas besoin d'un aller-retour réseau. */
  readonly typeFilter = signal<BookingType | null>(null);
  readonly bookingTypeOptions: BookingType[] = ['breakfast', 'lunch', 'dinner'];

  readonly sortField = signal<SortField>('hour');
  readonly sortDir = signal<SortDir>('asc');

  /** Réservation en attente de confirmation dans la modale "Valider" (voir validate()/confirmValidate()) — null = modale fermée. */
  readonly bookingToValidate = signal<Booking | null>(null);
  readonly validating = signal(false);

  /** Même pattern que bookingToValidate, pour la transition "Validée" -> "Présente" (voir
   *  markPresent()/confirmMarkPresent()). */
  readonly bookingToMarkPresent = signal<Booking | null>(null);
  readonly markingPresent = signal(false);

  readonly filteredBookings = computed(() => {
    const type = this.typeFilter();
    return type ? this.bookings().filter((booking) => booking.type === type) : this.bookings();
  });

  readonly totalGuests = computed(() =>
    this.filteredBookings().reduce((sum, booking) => sum + booking.number_of_guests, 0),
  );

  readonly sortedBookings = computed(() => {
    const field = this.sortField();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return [...this.filteredBookings()].sort((a, b) => this.compare(a, b, field) * dir);
  });

  constructor() {
    this.refresh();
  }

  typeLabel(type: BookingType): string {
    return TYPE_LABELS[type];
  }

  formatDate(booking: Booking): string {
    const [year, month, day] = booking.date.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }

  formatHour(booking: Booking): string {
    return booking.hour.slice(0, 5);
  }

  setDayFilter(value: string | null): void {
    this.dayFilter.set(value);
    this.refresh();
  }

  showAllDays(): void {
    this.setDayFilter(null);
  }

  goToToday(): void {
    this.setDayFilter(this.todayIso());
  }

  setTypeFilter(type: BookingType | null): void {
    this.typeFilter.set(type);
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

  /** Ouvre la modale de confirmation — voir validate() pour l'appel API réel, déclenché
   *  uniquement après confirmation explicite dans la modale ("être sûr de valider"). */
  confirmValidate(booking: Booking): void {
    this.bookingToValidate.set(booking);
  }

  cancelValidate(): void {
    this.bookingToValidate.set(null);
  }

  validate(): void {
    const booking = this.bookingToValidate();
    if (!booking || this.validating()) {
      return;
    }

    this.validating.set(true);
    this.bookingService.validate(booking.id).subscribe({
      next: () => {
        this.validating.set(false);
        this.bookingToValidate.set(null);
        this.refresh();
      },
      error: () => this.validating.set(false),
    });
  }

  confirmMarkPresent(booking: Booking): void {
    this.bookingToMarkPresent.set(booking);
  }

  cancelMarkPresent(): void {
    this.bookingToMarkPresent.set(null);
  }

  markPresent(): void {
    const booking = this.bookingToMarkPresent();
    if (!booking || this.markingPresent()) {
      return;
    }

    this.markingPresent.set(true);
    this.bookingService.markPresent(booking.id).subscribe({
      next: () => {
        this.markingPresent.set(false);
        this.bookingToMarkPresent.set(null);
        this.refresh();
      },
      error: () => this.markingPresent.set(false),
    });
  }

  remove(booking: Booking): void {
    if (!confirm(`Supprimer la réservation de ${booking.client?.firstname} ${booking.client?.lastname} ?`)) {
      return;
    }

    this.bookingService.remove(booking.id).subscribe(() => this.refresh());
  }

  private compare(a: Booking, b: Booking, field: SortField): number {
    switch (field) {
      case 'type':
        return this.typeLabel(a.type).localeCompare(this.typeLabel(b.type));
      case 'guests':
        return a.number_of_guests - b.number_of_guests;
      case 'client':
        return `${a.client?.lastname ?? ''} ${a.client?.firstname ?? ''}`.localeCompare(
          `${b.client?.lastname ?? ''} ${b.client?.firstname ?? ''}`,
        );
      default:
        return `${a.date}${a.hour}`.localeCompare(`${b.date}${b.hour}`);
    }
  }

  private todayIso(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private refresh(): void {
    this.bookingService.list(this.dayFilter() ?? undefined).subscribe((bookings) => this.bookings.set(bookings));
  }
}
