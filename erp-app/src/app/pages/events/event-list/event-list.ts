import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { EventService } from '../../../core/event.service';
import { EventDateService } from '../../../core/event-date.service';
import { RoomService } from '../../../core/room.service';
import { Event } from '../../../core/models/event.model';
import { Room } from '../../../core/models/floor-plan.model';

interface ImportDate {
  date: string;
  start_hour: string;
  room_name: string | null;
  number_place_limit: number | null;
}

interface ImportGroup {
  name: string;
  dates: ImportDate[];
}

const IMPORT_HEADING_RE = /^#{1,6}\s+(.+)$/;
// Date [heure] [| Salle] [| Limite de places] — salle et limite optionnelles, dans n'importe
// quel ordre de présence (mais pas l'une sans l'autre inversées : salle avant limite).
const IMPORT_DATE_RE =
  /^[-*]\s+(\d{4}-\d{2}-\d{2})(?:[\sT]+(\d{1,2}:\d{2}))?\s*(?:\|\s*([^|]*?)\s*)?(?:\|\s*(\d+)\s*)?$/;
const IMPORT_DEFAULT_HOUR = '21:00';

@Component({
  selector: 'app-event-list',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './event-list.html',
})
export class EventList {
  private readonly eventService = inject(EventService);
  private readonly eventDateService = inject(EventDateService);
  private readonly roomService = inject(RoomService);

  readonly events = signal<Event[]>([]);
  private readonly rooms = signal<Room[]>([]);

  // --- Import markdown ---
  readonly showImportModal = signal(false);
  readonly importText = signal('');
  readonly importing = signal(false);
  readonly importError = signal<string | null>(null);
  readonly importSummary = signal<string | null>(null);

  constructor() {
    this.refresh();
    this.roomService.list().subscribe((rooms) => this.rooms.set(rooms));
  }

  remove(event: Event): void {
    if (!confirm(`Supprimer l'événement "${event.name}" ? Toutes ses dates et les places vendues seront aussi supprimées.`)) {
      return;
    }

    this.eventService.remove(event.id).subscribe(() => this.refresh());
  }

  openImportModal(): void {
    this.importText.set('');
    this.importError.set(null);
    this.importSummary.set(null);
    this.showImportModal.set(true);
  }

  closeImportModal(): void {
    this.showImportModal.set(false);
  }

  async runImport(): Promise<void> {
    const groups = this.parseImportMarkdown(this.importText());
    if (!groups.length) {
      this.importError.set('Aucune date reconnue dans ce texte. Format attendu : "## Nom de l\'événement" suivi de lignes "- AAAA-MM-JJ HH:MM".');
      return;
    }

    this.importing.set(true);
    this.importError.set(null);
    this.importSummary.set(null);

    let eventsCreated = 0;
    let datesCreated = 0;
    const roomsNotFound = new Set<string>();

    try {
      for (const group of groups) {
        let eventId = this.events().find((e) => e.name.toLowerCase() === group.name.toLowerCase())?.id ?? null;

        if (eventId === null) {
          const created = await firstValueFrom(this.eventService.create({ name: group.name }));
          eventId = created.id;
          this.events.update((events) => [...events, created]);
          eventsCreated++;
        }

        for (const date of group.dates) {
          const roomId = this.resolveRoomId(date.room_name, roomsNotFound);
          await firstValueFrom(
            this.eventDateService.create(eventId, {
              date: date.date,
              start_hour: date.start_hour,
              room_id: roomId,
              number_place_limit: date.number_place_limit,
            }),
          );
          datesCreated++;
        }
      }

      let summary = `${eventsCreated} événement(s) créé(s), ${datesCreated} date(s) ajoutée(s).`;
      if (roomsNotFound.size) {
        summary += ` ⚠️ Salle introuvable, ignorée pour : ${[...roomsNotFound].join(', ')}.`;
      }
      this.importSummary.set(summary);
      this.importText.set('');
      this.refresh();
    } catch (err) {
      const error = err as { error?: { message?: string; errors?: Record<string, string[]> } };
      const messages = error.error?.errors ? Object.values(error.error.errors).flat() : null;
      this.importError.set(messages?.length ? messages.join(' ') : error.error?.message ?? "Erreur lors de l'import.");
    } finally {
      this.importing.set(false);
    }
  }

  /**
   * Format attendu (markdown) : un titre par événement, suivi d'une liste de dates.
   *   ## Concert de Jazz
   *   - 2026-08-15 21:00 | Salle Principale | 80
   *   - 2026-08-16
   * L'heure, la salle et la limite de places sont optionnelles (21:00 par défaut si l'heure est
   * omise). Les événements déjà existants (même nom, insensible à la casse) ne sont pas
   * recréés — seules leurs nouvelles dates sont ajoutées.
   */
  private parseImportMarkdown(text: string): ImportGroup[] {
    const groups: ImportGroup[] = [];
    let current: ImportGroup | null = null;

    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const heading = line.match(IMPORT_HEADING_RE);
      if (heading) {
        current = { name: heading[1].trim(), dates: [] };
        groups.push(current);
        continue;
      }

      const item = line.match(IMPORT_DATE_RE);
      if (item && current) {
        const roomName = item[3]?.trim() || null;
        const limit = item[4] ? Number(item[4]) : null;
        current.dates.push({ date: item[1], start_hour: item[2] ?? IMPORT_DEFAULT_HOUR, room_name: roomName, number_place_limit: limit });
      }
    }

    return groups.filter((group) => group.name && group.dates.length > 0);
  }

  private resolveRoomId(roomName: string | null, notFound: Set<string>): number | null {
    if (!roomName) {
      return null;
    }
    const match = this.rooms().find((room) => room.name.toLowerCase() === roomName.toLowerCase());
    if (!match) {
      notFound.add(roomName);
      return null;
    }
    return match.id;
  }

  private refresh(): void {
    this.eventService.list().subscribe((events) => this.events.set(events));
  }
}
