import { Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import jsQR from 'jsqr';
import { API_URL } from '../../../core/api-config';
import { EventDateService } from '../../../core/event-date.service';
import { EventTicketService } from '../../../core/event-ticket.service';
import { ClientService } from '../../../core/client.service';
import { EventDate, EventTicket } from '../../../core/models/event.model';
import { Client } from '../../../core/models/ticket.model';
import { TableElement } from '../../../core/models/floor-plan.model';
import { computeFitScale } from '../../../core/utils/fit-scale';

/**
 * Dashboard unique par occurrence (event_date) : vendre des places (éventuellement plusieurs
 * d'un coup), lister/modifier/supprimer les places vendues, valider une présence par code et
 * l'attribuer à une place si l'occurrence a une salle en placement strict — tout sur un seul
 * écran plutôt que trois pages séparées (demande explicite, voir Readme.md). Rescopé de
 * "par event" à "par date d'un event" depuis qu'un event a plusieurs occurrences (voir
 * Readme.md — event/event_dates).
 */
@Component({
  selector: 'app-event-dashboard',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './event-dashboard.html',
  styleUrl: './event-dashboard.css',
})
export class EventDashboard implements OnDestroy {
  private readonly eventDateService = inject(EventDateService);
  private readonly eventTicketService = inject(EventTicketService);
  private readonly clientService = inject(ClientService);
  private readonly route = inject(ActivatedRoute);

  private readonly eventDateId = Number(this.route.snapshot.paramMap.get('dateId'));

  readonly eventDate = signal<EventDate | null>(null);
  readonly tickets = signal<EventTicket[]>([]);

  // --- Vente de places ---
  readonly clientSearch = signal('');
  readonly clientResults = signal<Client[]>([]);
  readonly selectedClient = signal<Client | null>(null);
  readonly showNewClientForm = signal(false);
  readonly newClientFirstname = signal('');
  readonly newClientLastname = signal('');
  readonly newClientEmail = signal('');
  readonly newClientPhone = signal('');
  readonly savingClient = signal(false);
  readonly sendEmail = signal(true);
  readonly quantity = signal(1);

  readonly editingTicketId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly sellError = signal<string | null>(null);
  readonly lastSoldCodes = signal<string[]>([]);
  readonly lastSoldTickets = signal<EventTicket[]>([]);

  private readonly clientSearch$ = new Subject<string>();

  // --- Validation & placement ---
  readonly code = signal('');
  readonly selectedTableId = signal<number | null>(null);
  readonly validating = signal(false);
  readonly validateError = signal<string | null>(null);
  readonly validateSuccess = signal<string | null>(null);

  // --- Scan QR (caméra) ---
  @ViewChild('scanVideo') private readonly scanVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('scanCanvas') private readonly scanCanvasRef?: ElementRef<HTMLCanvasElement>;
  readonly scanning = signal(false);
  readonly scanError = signal<string | null>(null);
  private scanStream: MediaStream | null = null;
  private scanFrameId: number | null = null;

  /** Tout élément actif du plan (tables + murs/textes décoratifs, voir floor-plan-editor.ts) —
   *  pour un rendu visuel identique à l'éditeur. Murs/textes restent affichés mais jamais
   *  sélectionnables/assignables à une place, voir selectTable(). */
  readonly planElements = computed<TableElement[]>(() => (this.eventDate()?.room?.tables ?? []).filter((table) => table.active));

  @ViewChild('canvas') private readonly canvasRef?: ElementRef<HTMLDivElement>;
  private resizeObserver?: ResizeObserver;
  private readonly containerSize = signal({ width: 0, height: 0 });

  /** Échelle du plan pour qu'il tienne toujours dans son conteneur sans barre de défilement —
   *  voir computeFitScale() et table-select.ts (même principe). */
  readonly scale = computed(() => {
    const room = this.eventDate()?.room;
    const { width, height } = this.containerSize();
    return room ? computeFitScale(width, height, room.width, room.height) : 1;
  });

  readonly selectedTableLabel = computed(
    () => this.planElements().find((table) => table.id === this.selectedTableId())?.label ?? '',
  );

  readonly occupiedByTable = computed(() => {
    const map = new Map<number, EventTicket>();
    for (const ticket of this.tickets()) {
      if (ticket.validated_at && ticket.table_id !== null) {
        map.set(ticket.table_id, ticket);
      }
    }
    return map;
  });

  readonly placesLeft = computed(() => {
    const limit = this.eventDate()?.number_place_limit;
    return limit === null || limit === undefined ? null : Math.max(limit - this.tickets().length, 0);
  });

  constructor() {
    this.eventDateService.get(this.eventDateId).subscribe((eventDate) => {
      this.eventDate.set(eventDate);
      // Le canvas n'existe dans le DOM (@if eventDate()?.room_id) qu'une fois la salle chargée —
      // laisser Angular rendre avant d'y attacher le ResizeObserver.
      setTimeout(() => this.observeCanvas());
    });
    this.refreshTickets();

    this.clientSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => this.clientService.search(query)),
      )
      .subscribe((results) => this.clientResults.set(results));
  }

  formatDateTime(value: string | null): string {
    if (!value) {
      return '—';
    }
    return new Date(value).toLocaleString('fr-FR');
  }

  formatDate(eventDate: EventDate): string {
    const [year, month, day] = eventDate.date.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }

  formatHour(eventDate: EventDate): string {
    return eventDate.start_hour.slice(0, 5);
  }

  // --- Vente ---

  onClientSearchChange(value: string): void {
    this.clientSearch.set(value);
    if (value.trim().length >= 2) {
      this.clientSearch$.next(value.trim());
    } else {
      this.clientResults.set([]);
    }
  }

  selectClient(client: Client): void {
    this.selectedClient.set(client);
    this.clientSearch.set('');
    this.clientResults.set([]);
    this.showNewClientForm.set(false);
  }

  clearClient(): void {
    this.selectedClient.set(null);
  }

  toggleNewClientForm(): void {
    this.showNewClientForm.set(!this.showNewClientForm());
    this.clientResults.set([]);
  }

  submitNewClient(): void {
    if (!this.newClientFirstname().trim() || !this.newClientLastname().trim()) {
      return;
    }

    this.savingClient.set(true);
    this.clientService
      .create({
        firstname: this.newClientFirstname().trim(),
        lastname: this.newClientLastname().trim(),
        email: this.newClientEmail().trim() || undefined,
        phone: this.newClientPhone().trim() || undefined,
      })
      .subscribe({
        next: (client) => {
          this.savingClient.set(false);
          this.newClientFirstname.set('');
          this.newClientLastname.set('');
          this.newClientEmail.set('');
          this.newClientPhone.set('');
          this.selectClient(client);
        },
        error: () => this.savingClient.set(false),
      });
  }

  startEdit(ticket: EventTicket): void {
    this.editingTicketId.set(ticket.id);
    this.selectedClient.set(ticket.client ?? null);
    this.sellError.set(null);
    this.lastSoldCodes.set([]);
  }

  cancelEdit(): void {
    this.editingTicketId.set(null);
    this.selectedClient.set(null);
  }

  removeTicket(ticket: EventTicket): void {
    if (!confirm(`Supprimer la place de ${ticket.client?.firstname} ${ticket.client?.lastname} ?`)) {
      return;
    }

    this.eventTicketService.remove(ticket.id).subscribe(() => this.refreshTickets());
  }

  /**
   * Ouvre un onglet dédié avec un QR + code par place, puis lance l'impression du navigateur —
   * "Enregistrer en PDF" est déjà une option native de cette boîte de dialogue sur tous les OS,
   * pas besoin d'une lib de génération PDF séparée pour couvrir "imprimer ou enregistrer en PDF".
   */
  printTickets(tickets: EventTicket[]): void {
    const printWindow = window.open('', '_blank');
    if (!printWindow || tickets.length === 0) {
      return;
    }

    const eventDate = this.eventDate();
    const title = eventDate ? `${eventDate.event?.name} — ${this.formatDate(eventDate)} ${this.formatHour(eventDate)}` : '';
    const blocks = tickets
      .map(
        (ticket) => `
          <div class="ticket">
            <img src="${API_URL}/event-tickets/${ticket.id}/qr" alt="QR ${ticket.validation_code}" />
            <p class="code">${ticket.validation_code}</p>
            <p class="client">${ticket.client?.firstname ?? ''} ${ticket.client?.lastname ?? ''}</p>
          </div>`,
      )
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="utf-8">
        <title>Places — ${title}</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; }
          h1 { font-size: 18px; }
          .tickets { display: flex; flex-wrap: wrap; gap: 16px; }
          .ticket { width: 220px; border: 1px solid #ccc; border-radius: 12px; padding: 16px; text-align: center; page-break-inside: avoid; }
          .ticket img { width: 100%; height: auto; }
          .code { font-size: 18px; font-weight: bold; letter-spacing: 2px; margin: 8px 0 4px; }
          .client { margin: 0; color: #555; font-size: 13px; }
        </style>
      </head>
      <body>
        <h1>${title} — ${tickets.length} place(s)</h1>
        <div class="tickets">${blocks}</div>
      </body>
      </html>
    `);
    printWindow.document.close();

    const images = Array.from(printWindow.document.images);
    Promise.all(
      images.map(
        (img) => new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
          } else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        }),
      ),
    ).then(() => printWindow.print());
  }

  submitSale(): void {
    const client = this.selectedClient();
    if (!client) {
      return;
    }

    this.sellError.set(null);
    this.saving.set(true);
    const editingId = this.editingTicketId();

    if (editingId !== null) {
      this.eventTicketService.update(editingId, client.id).subscribe({
        next: () => {
          this.saving.set(false);
          this.selectedClient.set(null);
          this.editingTicketId.set(null);
          this.refreshTickets();
        },
        error: (err) => {
          this.saving.set(false);
          this.sellError.set(err.error?.message ?? "Impossible d'enregistrer.");
        },
      });
      return;
    }

    this.eventTicketService
      .create({ event_date_id: this.eventDateId, client_id: client.id, send_email: this.sendEmail(), quantity: this.quantity() })
      .subscribe({
        next: (tickets) => {
          this.saving.set(false);
          this.selectedClient.set(null);
          this.sendEmail.set(true);
          this.quantity.set(1);
          this.lastSoldCodes.set(tickets.map((t) => t.validation_code));
          this.lastSoldTickets.set(tickets);
          this.refreshTickets();
        },
        error: (err) => {
          this.saving.set(false);
          this.sellError.set(err.error?.message ?? "Impossible d'enregistrer la vente.");
        },
      });
  }

  // --- Validation & placement ---

  occupant(table: TableElement): EventTicket | null {
    return this.occupiedByTable().get(table.id) ?? null;
  }

  selectTable(table: TableElement): void {
    if (table.type !== 'table' || this.occupant(table)) {
      return;
    }
    this.selectedTableId.set(this.selectedTableId() === table.id ? null : table.id);
  }

  submitValidation(): void {
    if (!this.code().trim()) {
      return;
    }

    this.validateError.set(null);
    this.validateSuccess.set(null);
    this.validating.set(true);

    this.eventTicketService
      .validate({ code: this.code().trim(), table_id: this.selectedTableId() ?? undefined })
      .subscribe({
        next: (ticket) => {
          this.validating.set(false);
          const place = ticket.table?.label ? ` — place ${ticket.table.label}` : '';
          this.validateSuccess.set(`✓ ${ticket.client?.firstname} ${ticket.client?.lastname} validé(e)${place}`);
          this.code.set('');
          this.selectedTableId.set(null);
          this.refreshTickets();
        },
        error: (err) => {
          this.validating.set(false);
          this.validateError.set(err.error?.message ?? 'Code invalide.');
        },
      });
  }

  // --- Scan QR (caméra) ---

  async startScan(): Promise<void> {
    this.scanError.set(null);
    this.scanning.set(true);

    try {
      this.scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch {
      this.scanError.set("Impossible d'accéder à la caméra (permission refusée ou aucune caméra disponible).");
      this.scanning.set(false);
      return;
    }

    // Le <video> n'existe dans le DOM qu'une fois scanning() à true — laisser Angular
    // rendre avant d'y attacher le flux.
    setTimeout(() => {
      const video = this.scanVideoRef?.nativeElement;
      if (!video) {
        return;
      }
      video.srcObject = this.scanStream;
      video.play();
      this.scanFrameId = requestAnimationFrame(() => this.scanFrame());
    });
  }

  stopScan(): void {
    if (this.scanFrameId !== null) {
      cancelAnimationFrame(this.scanFrameId);
      this.scanFrameId = null;
    }
    this.scanStream?.getTracks().forEach((track) => track.stop());
    this.scanStream = null;
    this.scanning.set(false);
  }

  private scanFrame(): void {
    const video = this.scanVideoRef?.nativeElement;
    const canvas = this.scanCanvasRef?.nativeElement;

    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      this.scanFrameId = requestAnimationFrame(() => this.scanFrame());
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height);

    if (result?.data) {
      this.stopScan();
      this.code.set(result.data.trim());
      this.submitValidation();
      return;
    }

    this.scanFrameId = requestAnimationFrame(() => this.scanFrame());
  }

  ngOnDestroy(): void {
    this.stopScan();
    this.resizeObserver?.disconnect();
  }

  private observeCanvas(): void {
    const el = this.canvasRef?.nativeElement;
    if (!el) {
      return;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      this.containerSize.set({ width: el.clientWidth, height: el.clientHeight });
    });
    this.resizeObserver.observe(el);
  }

  private refreshTickets(): void {
    this.eventTicketService.listForEventDate(this.eventDateId).subscribe((tickets) => this.tickets.set(tickets));
  }
}
