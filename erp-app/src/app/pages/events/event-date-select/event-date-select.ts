import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EventDateService } from '../../../core/event-date.service';
import { EventDate } from '../../../core/models/event.model';
import { DatePicker } from '../../../shared/date-picker/date-picker';

interface CalendarCell {
  day: number;
  dateKey: string;
  inMonth: boolean;
  isToday: boolean;
  dates: EventDate[];
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/**
 * Point d'entrée rapide "Vendre des places" depuis /evenements — liste toutes les occurrences
 * à venir tous events confondus (pas de détour par event → dates), triées chronologiquement
 * (la plus proche d'abord, ce qui est déjà l'ordre naturel puisqu'on exclut le passé). Le
 * calendrier (voir viewMode) reprend tel quel le calcul de grille mensuelle de
 * event-detail.ts — même principe, juste rescopé à tous les events confondus (pas un seul).
 */
@Component({
  selector: 'app-event-date-select',
  standalone: true,
  imports: [RouterLink, FormsModule, DatePicker],
  templateUrl: './event-date-select.html',
})
export class EventDateSelect {
  private readonly eventDateService = inject(EventDateService);

  readonly loading = signal(true);
  readonly viewMode = signal<'liste' | 'calendrier'>('liste');

  private readonly today = new Date();
  private readonly todayKey = this.dateKey(this.today.toISOString());
  readonly currentYear = signal(this.today.getFullYear());
  readonly currentMonthIndex = signal(this.today.getMonth());
  readonly weekdayLabels = WEEKDAY_LABELS;

  private readonly allDates = signal<EventDate[]>([]);

  readonly nameFilter = signal('');
  readonly dateFilter = signal<string | null>(null);

  readonly upcomingDates = computed(() => {
    const name = this.nameFilter().trim().toLowerCase();
    const date = this.dateFilter();

    return [...this.allDates()]
      .filter((eventDate) => this.dateKey(eventDate.date) >= this.todayKey)
      .filter((eventDate) => !name || (eventDate.event?.name ?? '').toLowerCase().includes(name))
      .filter((eventDate) => !date || this.dateKey(eventDate.date) === date)
      .sort((a, b) => this.dateKey(a.date).localeCompare(this.dateKey(b.date)) || a.start_hour.localeCompare(b.start_hour));
  });

  readonly monthLabel = computed(() => {
    const label = new Date(this.currentYear(), this.currentMonthIndex(), 1).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  /** Base du calendrier : seul le filtre par nom s'applique — le passage en revue mois par mois
   *  remplace à la fois le masquage du passé et le filtre par date exacte de la vue liste (voir
   *  upcomingDates()), qui n'ont plus de sens une fois qu'on navigue soi-même dans le calendrier. */
  private readonly datesByDay = computed(() => {
    const name = this.nameFilter().trim().toLowerCase();
    const map = new Map<string, EventDate[]>();
    for (const eventDate of this.allDates()) {
      if (name && !(eventDate.event?.name ?? '').toLowerCase().includes(name)) {
        continue;
      }
      const key = this.dateKey(eventDate.date);
      map.set(key, [...(map.get(key) ?? []), eventDate]);
    }
    return map;
  });

  readonly calendarCells = computed<CalendarCell[]>(() => {
    const year = this.currentYear();
    const month = this.currentMonthIndex();
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
        isToday: key === this.todayKey,
        dates: byDay.get(key) ?? [],
      };
    });
  });

  constructor() {
    this.eventDateService.list().subscribe((dates) => {
      this.allDates.set(dates);
      this.loading.set(false);
    });
  }

  formatDate(eventDate: EventDate): string {
    const [year, month, day] = this.dateKey(eventDate.date).split('-');
    return `${day}/${month}/${year}`;
  }

  formatHour(eventDate: EventDate): string {
    return eventDate.start_hour.slice(0, 5);
  }

  isToday(eventDate: EventDate): boolean {
    return this.dateKey(eventDate.date) === this.todayKey;
  }

  placesSold(eventDate: EventDate): number {
    return eventDate.tickets_count ?? 0;
  }

  /** Même calcul que event-dashboard.ts::placesLeft — null si pas de limite (illimité), jamais négatif. */
  placesLeft(eventDate: EventDate): number | null {
    const limit = eventDate.number_place_limit;
    return limit === null ? null : Math.max(limit - this.placesSold(eventDate), 0);
  }

  prevMonth(): void {
    this.shiftMonth(-1);
  }

  nextMonth(): void {
    this.shiftMonth(1);
  }

  goToToday(): void {
    this.currentYear.set(this.today.getFullYear());
    this.currentMonthIndex.set(this.today.getMonth());
  }

  private shiftMonth(delta: number): void {
    const next = new Date(this.currentYear(), this.currentMonthIndex() + delta, 1);
    this.currentYear.set(next.getFullYear());
    this.currentMonthIndex.set(next.getMonth());
  }

  private toKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private dateKey(isoDate: string): string {
    return isoDate.slice(0, 10);
  }
}
