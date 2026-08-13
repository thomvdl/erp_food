import { Component, computed, inject, signal } from '@angular/core';
import { CompanyService } from '../../core/company.service';
import { EventDateService } from '../../core/event-date.service';
import { Company } from '../../core/models/booking.model';
import { EventDate } from '../../core/models/event.model';

interface CalendarCell {
  day: number;
  dateKey: string;
  inMonth: boolean;
  isPast: boolean;
  isToday: boolean;
  dates: EventDate[];
}

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Voir Readme.md/demande utilisateur : n'afficher le compteur que quand il devient rare (crée
 *  un sentiment d'urgence utile), pas un simple "48 places restantes" sur une salle qui vient
 *  d'ouvrir — sans intérêt et donne l'impression d'un compteur cassé/statique. */
const LOW_STOCK_THRESHOLD = 10;

interface AvailabilityLabel {
  text: string;
  full: boolean;
}

@Component({
  selector: 'app-events',
  standalone: true,
  templateUrl: './events.html',
})
export class Events {
  private readonly eventDateService = inject(EventDateService);
  private readonly companyService = inject(CompanyService);

  private readonly allDates = signal<EventDate[]>([]);
  readonly loading = signal(true);
  readonly company = signal<Company | null>(null);

  private readonly today = new Date();
  private readonly todayKey = this.toKey(this.today);

  readonly calendarYear = signal(this.today.getFullYear());
  readonly calendarMonthIndex = signal(this.today.getMonth());
  readonly weekdayLabels = WEEKDAY_LABELS;
  readonly selectedDateKey = signal<string | null>(null);

  readonly monthLabel = computed(() => {
    const label = new Date(this.calendarYear(), this.calendarMonthIndex(), 1).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  /** Occurrences à venir uniquement, triées — la liste chronologique sous le calendrier
   *  (voir Readme.md des autres apps : "n'affiche pas les event passé de date"). */
  readonly upcomingDates = computed(() =>
    this.allDates()
      .filter((eventDate) => this.dateKey(eventDate.date) >= this.todayKey)
      .sort((a, b) => (this.dateKey(a.date) + a.start_hour).localeCompare(this.dateKey(b.date) + b.start_hour)),
  );

  private readonly datesByDay = computed(() => {
    const map = new Map<string, EventDate[]>();
    for (const eventDate of this.allDates()) {
      const key = this.dateKey(eventDate.date);
      map.set(key, [...(map.get(key) ?? []), eventDate]);
    }
    return map;
  });

  readonly calendarCells = computed<CalendarCell[]>(() => {
    const year = this.calendarYear();
    const month = this.calendarMonthIndex();
    const byDay = this.datesByDay();

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
        dates: byDay.get(key) ?? [],
      };
    });
  });

  readonly selectedDayEvents = computed(() => {
    const key = this.selectedDateKey();
    if (!key) {
      return [];
    }
    return this.datesByDay().get(key) ?? [];
  });

  constructor() {
    this.eventDateService.list().subscribe({
      next: (dates) => {
        this.allDates.set(dates);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.companyService.get().subscribe({ next: (company) => this.company.set(company) });
  }

  prevMonth(): void {
    this.shiftMonth(-1);
  }

  nextMonth(): void {
    this.shiftMonth(1);
  }

  selectDay(cell: CalendarCell): void {
    if (cell.dates.length === 0) {
      return;
    }
    this.selectedDateKey.set(cell.dateKey === this.selectedDateKey() ? null : cell.dateKey);
  }

  formatDate(eventDate: EventDate): string {
    const [year, month, day] = this.dateKey(eventDate.date).split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  formatHour(eventDate: EventDate): string {
    return eventDate.start_hour.slice(0, 5);
  }

  /** `null` = rien à afficher : pas de limite de places pour cette occurrence (voir Readme.md),
   *  ou stock encore confortable (> LOW_STOCK_THRESHOLD) — le badge n'apparaît que quand il
   *  devient utile (bientôt complet) ou une fois réellement complet. */
  availabilityLabel(eventDate: EventDate): AvailabilityLabel | null {
    if (eventDate.number_place_limit === null) {
      return null;
    }

    const remaining = Math.max(0, eventDate.number_place_limit - (eventDate.tickets_count ?? 0));

    if (remaining === 0) {
      return { text: 'Complet', full: true };
    }

    if (remaining <= LOW_STOCK_THRESHOLD) {
      return { text: `${remaining} place${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}`, full: false };
    }

    return null;
  }

  private shiftMonth(delta: number): void {
    const next = new Date(this.calendarYear(), this.calendarMonthIndex() + delta, 1);
    this.calendarYear.set(next.getFullYear());
    this.calendarMonthIndex.set(next.getMonth());
  }

  private dateKey(isoDate: string): string {
    return isoDate.slice(0, 10);
  }

  private toKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
