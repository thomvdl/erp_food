import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { EventService } from '../../../core/event.service';
import { EventDateService } from '../../../core/event-date.service';
import { RoomService } from '../../../core/room.service';
import { Event, EventDate } from '../../../core/models/event.model';
import { Room } from '../../../core/models/floor-plan.model';
import { DatePicker } from '../../../shared/date-picker/date-picker';
import { TimePicker } from '../../../shared/time-picker/time-picker';

interface CalendarCell {
  day: number;
  dateKey: string;
  inMonth: boolean;
  isToday: boolean;
  dates: EventDate[];
}

interface PendingDate {
  date: string;
  start_hour: string;
  room_id: number | null;
  number_place_limit: number | null;
}

const DEFAULT_START_HOUR = '21:00';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

type SortField = 'date' | 'room' | 'limit';
type SortDir = 'asc' | 'desc';

/**
 * Gestion des dates (occurrences) d'un event : "on va créer un event puis ajouter des dates,
 * heure, places, room" (voir Readme.md). Le calendrier/tri par proximité/surbrillance
 * "aujourd'hui" qui vivaient auparavant dans event-list.ts sont repris ici tels quels, juste
 * rescopés aux dates de CET event plutôt qu'à tous les events confondus.
 */
@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePicker, TimePicker],
  templateUrl: './event-detail.html',
  styleUrl: './event-detail.css',
})
export class EventDetail {
  private readonly eventService = inject(EventService);
  private readonly eventDateService = inject(EventDateService);
  private readonly roomService = inject(RoomService);
  private readonly route = inject(ActivatedRoute);

  private readonly eventId = Number(this.route.snapshot.paramMap.get('id'));

  readonly event = signal<Event | null>(null);
  readonly dates = signal<EventDate[]>([]);
  readonly rooms = signal<Room[]>([]);
  readonly viewMode = signal<'liste' | 'calendrier'>('liste');

  private readonly today = new Date();
  readonly todayKey = this.dateKey(this.today.toISOString());
  readonly currentYear = signal(this.today.getFullYear());
  readonly currentMonthIndex = signal(this.today.getMonth());
  readonly weekdayLabels = WEEKDAY_LABELS;

  readonly sortField = signal<SortField>('date');
  readonly sortDir = signal<SortDir>('asc');

  // --- Formulaire d'ajout/édition de date ---
  readonly editingDateId = signal<number | null>(null);
  readonly pendingDates = signal<PendingDate[]>([this.defaultRow()]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  /** Seulement les salles pensées pour un événement (voir rooms.type) — pas les salles du POS
   *  Restaurant, qui n'ont pas de sens ici. Et seulement les salles actives (voir Readme.md,
   *  "n'afficher que les éléments actifs"). */
  readonly eventRooms = computed(() => this.rooms().filter((room) => room.type === 'event' && room.active));

  readonly sortedDates = computed(() => {
    const field = this.sortField();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return [...this.dates()].sort((a, b) => this.compare(a, b, field) * dir);
  });

  readonly monthLabel = computed(() => {
    const label = new Date(this.currentYear(), this.currentMonthIndex(), 1).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  private readonly datesByDay = computed(() => {
    const map = new Map<string, EventDate[]>();
    for (const eventDate of this.dates()) {
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
    this.eventService.get(this.eventId).subscribe((event) => this.event.set(event));
    this.roomService.list().subscribe((rooms) => this.rooms.set(rooms));
    this.refreshDates();
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

  startEdit(eventDate: EventDate): void {
    this.editingDateId.set(eventDate.id);
    this.pendingDates.set([
      {
        date: this.dateKey(eventDate.date),
        start_hour: eventDate.start_hour.slice(0, 5),
        room_id: eventDate.room_id,
        number_place_limit: eventDate.number_place_limit,
      },
    ]);
    this.error.set(null);
  }

  cancelEdit(): void {
    this.editingDateId.set(null);
    this.pendingDates.set([this.defaultRow()]);
    this.error.set(null);
  }

  addPendingRow(): void {
    const rows = this.pendingDates();
    this.pendingDates.set([...rows, this.defaultRow(rows[rows.length - 1])]);
  }

  removePendingRow(index: number): void {
    const rows = this.pendingDates();
    if (rows.length <= 1) {
      return;
    }
    this.pendingDates.set(rows.filter((_, i) => i !== index));
  }

  updatePendingRow(index: number, patch: Partial<PendingDate>): void {
    this.pendingDates.set(this.pendingDates().map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  submitDates(): void {
    this.error.set(null);
    this.saving.set(true);

    const editingId = this.editingDateId();

    if (editingId !== null) {
      const payload = this.pendingDates()[0];
      this.eventDateService.update(editingId, payload).subscribe({
        next: () => {
          this.saving.set(false);
          this.cancelEdit();
          this.refreshDates();
        },
        error: (err) => this.handleSaveError(err),
      });
      return;
    }

    forkJoin(this.pendingDates().map((row) => this.eventDateService.create(this.eventId, row))).subscribe({
      next: () => {
        this.saving.set(false);
        this.pendingDates.set([this.defaultRow()]);
        this.refreshDates();
      },
      error: (err) => this.handleSaveError(err),
    });
  }

  removeDate(eventDate: EventDate): void {
    if (!confirm(`Supprimer la date du ${this.formatDate(eventDate)} ? Les places vendues pour cette date seront aussi supprimées.`)) {
      return;
    }

    this.eventDateService.remove(eventDate.id).subscribe(() => this.refreshDates());
  }

  private handleSaveError(err: { error?: { errors?: Record<string, string[]> } }): void {
    this.saving.set(false);
    const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
    this.error.set(messages?.length ? messages.join(' ') : "Impossible d'enregistrer cette date.");
  }

  private defaultRow(base?: PendingDate): PendingDate {
    if (!base) {
      return { date: this.todayIso(), start_hour: DEFAULT_START_HOUR, room_id: null, number_place_limit: null };
    }
    return { ...base, date: this.addDays(base.date, 1) };
  }

  private todayIso(): string {
    return this.toKey(new Date());
  }

  private addDays(dateStr: string, days: number): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    return this.toKey(new Date(year, month - 1, day + days));
  }

  private dateKey(isoDate: string): string {
    return isoDate.slice(0, 10);
  }

  private compare(a: EventDate, b: EventDate, field: SortField): number {
    switch (field) {
      case 'room':
        return (a.room?.name ?? '').localeCompare(b.room?.name ?? '');
      case 'limit':
        return (a.number_place_limit ?? Infinity) - (b.number_place_limit ?? Infinity);
      default: {
        const distanceA = Math.abs(new Date(this.dateKey(a.date)).getTime() - new Date(this.todayKey).getTime());
        const distanceB = Math.abs(new Date(this.dateKey(b.date)).getTime() - new Date(this.todayKey).getTime());
        return distanceA - distanceB || a.start_hour.localeCompare(b.start_hour);
      }
    }
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

  private refreshDates(): void {
    this.eventDateService.list(this.eventId).subscribe((dates) => this.dates.set(dates));
  }
}
