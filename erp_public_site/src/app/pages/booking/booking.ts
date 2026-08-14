import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BookingService } from '../../core/booking.service';
import { CreateBookingPayload } from '../../core/models/booking.model';

interface CalendarCell {
  day: number;
  dateKey: string;
  inMonth: boolean;
  isPast: boolean;
  isToday: boolean;
  isSelected: boolean;
}

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Restaurant fermé le midi (voir demande utilisateur : "service met automatiquement et
 *  uniquement diner") — un seul service proposé au public, deux créneaux fixes plutôt qu'un
 *  champ heure libre (moins d'erreurs de saisie, aligné sur les vrais services du restaurant). */
const HOUR_OPTIONS = ['18:00', '21:00'];

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './booking.html',
})
export class Booking {
  private readonly bookingService = inject(BookingService);

  readonly firstname = signal('');
  readonly lastname = signal('');
  readonly email = signal('');
  readonly phone = signal('');
  readonly numberOfGuests = signal<number | null>(2);
  readonly date = signal('');
  readonly hour = signal(HOUR_OPTIONS[0]);

  readonly hourOptions = HOUR_OPTIONS;

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);

  // ---------- Sélecteur de date (popover calendrier plutôt que l'input natif du navigateur,
  // dont le rendu/l'ergonomie changent d'un navigateur à l'autre) ----------
  readonly datePickerOpen = signal(false);

  private readonly today = new Date();
  private readonly todayKey = this.toKey(this.today);
  readonly calendarYear = signal(this.today.getFullYear());
  readonly calendarMonthIndex = signal(this.today.getMonth());

  readonly monthLabel = computed(() => {
    const label = new Date(this.calendarYear(), this.calendarMonthIndex(), 1).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  readonly weekdayLabels = WEEKDAY_LABELS;

  readonly calendarCells = computed<CalendarCell[]>(() => {
    const year = this.calendarYear();
    const month = this.calendarMonthIndex();
    const selected = this.date();

    const firstOfMonth = new Date(year, month, 1);
    const leadingBlankDays = (firstOfMonth.getDay() + 6) % 7;
    const startDate = new Date(year, month, 1 - leadingBlankDays);

    return Array.from({ length: 42 }, (_, i) => {
      const cellDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
      const key = this.toKey(cellDate);
      return {
        day: cellDate.getDate(),
        dateKey: key,
        inMonth: cellDate.getMonth() === month,
        isPast: key < this.todayKey,
        isToday: key === this.todayKey,
        isSelected: key === selected,
      };
    });
  });

  /** Affiché sur le déclencheur du popover une fois une date choisie — plus lisible qu'une
   *  ISO brute (voir Readme.md, cohérent avec le format déjà utilisé côté erp-app/booking-list). */
  readonly formattedDate = computed(() => {
    const value = this.date();
    if (!value) {
      return null;
    }
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  });

  toggleDatePicker(): void {
    this.datePickerOpen.update((open) => !open);
  }

  closeDatePicker(): void {
    this.datePickerOpen.set(false);
  }

  prevMonth(): void {
    this.shiftMonth(-1);
  }

  nextMonth(): void {
    this.shiftMonth(1);
  }

  selectDay(cell: CalendarCell): void {
    if (cell.isPast) {
      return;
    }
    this.date.set(cell.dateKey);
    this.datePickerOpen.set(false);
  }

  private shiftMonth(delta: number): void {
    const next = new Date(this.calendarYear(), this.calendarMonthIndex() + delta, 1);
    this.calendarYear.set(next.getFullYear());
    this.calendarMonthIndex.set(next.getMonth());
  }

  private toKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  submit(): void {
    this.error.set(null);
    this.submitting.set(true);

    const payload: CreateBookingPayload = {
      firstname: this.firstname().trim(),
      lastname: this.lastname().trim(),
      email: this.email().trim(),
      phone: this.phone().trim(),
      number_of_guests: this.numberOfGuests() ?? 1,
      // Un seul service proposé au public pour l'instant (voir HOUR_OPTIONS) — pas de champ
      // dans le formulaire, toujours "dinner".
      type: 'dinner',
      date: this.date(),
      hour: this.hour(),
    };

    this.bookingService.create(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.submitted.set(true);
      },
      error: (err) => {
        this.submitting.set(false);
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.error.set(messages?.length ? messages.join(' ') : "Impossible d'envoyer votre demande. Réessayez ou appelez-nous.");
      },
    });
  }
}
