import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { EventDateService } from '../../core/event-date.service';
import { ThemeService } from '../../core/theme.service';
import { EventDate } from '../../core/models/event.model';

interface CalendarCell {
  day: number;
  dateKey: string;
  inMonth: boolean;
  isToday: boolean;
  dates: EventDate[];
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

@Component({
  selector: 'app-event-select',
  standalone: true,
  templateUrl: './event-select.html',
  styleUrl: './event-select.css',
})
export class EventSelect {
  private readonly eventDateService = inject(EventDateService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly themeService = inject(ThemeService);

  private readonly allDates = signal<EventDate[]>([]);
  readonly loading = signal(true);
  readonly viewMode = signal<'liste' | 'calendrier'>('liste');

  /** La liste reste limitée aux occurrences à venir (voir Readme.md : "n'affiche pas les event
   *  passé de date") — seul le calendrier montre aussi le passé, en grisé (voir isPast()). */
  readonly upcomingDates = computed(() => this.allDates().filter((eventDate) => this.dateKey(eventDate.date) >= this.todayKey));

  private readonly today = new Date();
  readonly todayKey = this.toKey(this.today);
  readonly currentYear = signal(this.today.getFullYear());
  readonly currentMonthIndex = signal(this.today.getMonth());

  readonly weekdayLabels = WEEKDAY_LABELS;

  readonly monthLabel = computed(() => {
    const label = new Date(this.currentYear(), this.currentMonthIndex(), 1).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  private readonly datesByDay = computed(() => {
    const map = new Map<string, EventDate[]>();
    for (const eventDate of this.allDates()) {
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

  isPast(eventDate: EventDate): boolean {
    return this.dateKey(eventDate.date) < this.todayKey;
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

  select(eventDate: EventDate): void {
    this.router.navigate(['/check-in', eventDate.id]);
  }

  logout(): void {
    this.authService.logout().subscribe({
      complete: () => this.router.navigateByUrl('/login'),
      error: () => this.router.navigateByUrl('/login'),
    });
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

  private shiftMonth(delta: number): void {
    const next = new Date(this.currentYear(), this.currentMonthIndex() + delta, 1);
    this.currentYear.set(next.getFullYear());
    this.currentMonthIndex.set(next.getMonth());
  }
}
