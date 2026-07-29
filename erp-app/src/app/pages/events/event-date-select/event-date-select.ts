import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EventDateService } from '../../../core/event-date.service';
import { EventDate } from '../../../core/models/event.model';
import { DatePicker } from '../../../shared/date-picker/date-picker';

/**
 * Point d'entrée rapide "Vendre des places" depuis /evenements — liste toutes les occurrences
 * à venir tous events confondus (pas de détour par event → dates), triées chronologiquement
 * (la plus proche d'abord, ce qui est déjà l'ordre naturel puisqu'on exclut le passé).
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

  private readonly today = new Date();
  private readonly todayKey = this.dateKey(this.today.toISOString());

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

  private dateKey(isoDate: string): string {
    return isoDate.slice(0, 10);
  }
}
