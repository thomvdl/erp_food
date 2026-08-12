import { Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, forkJoin, switchMap } from 'rxjs';
import jsQR from 'jsqr';
import { API_URL } from '../../../core/api-config';
import { EventDateService } from '../../../core/event-date.service';
import { EventTicketService } from '../../../core/event-ticket.service';
import { EventTicketPriceService } from '../../../core/event-ticket-price.service';
import { ClientService } from '../../../core/client.service';
import { PaymentMethodService } from '../../../core/payment-method.service';
import { ActiveCashierService } from '../../../core/active-cashier.service';
import { EventDate, EventTicket, EventTicketPrice } from '../../../core/models/event.model';
import { Client, PaymentMethod } from '../../../core/models/ticket.model';
import { TableElement } from '../../../core/models/floor-plan.model';
import { computeFitScale } from '../../../core/utils/fit-scale';
import { formatMoney } from '../../../core/ticket-print.util';

/** Une ligne du panier de vente (voir EventDashboard.saleLines) — un type + une quantité. */
interface SaleLine {
  event_ticket_type_id: number | null;
  quantity: number;
}

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
  readonly formatMoney = formatMoney;

  private readonly eventDateService = inject(EventDateService);
  private readonly eventTicketService = inject(EventTicketService);
  private readonly ticketPriceService = inject(EventTicketPriceService);
  private readonly clientService = inject(ClientService);
  private readonly paymentMethodService = inject(PaymentMethodService);
  private readonly activeCashierService = inject(ActiveCashierService);
  private readonly route = inject(ActivatedRoute);

  private readonly eventDateId = Number(this.route.snapshot.paramMap.get('dateId'));

  readonly eventDate = signal<EventDate | null>(null);
  readonly tickets = signal<EventTicket[]>([]);

  /** Onglets "Vente de place" / "Valider une place" (demande explicite, voir Readme.md) — les
   *  deux cartes vivaient sur un seul écran continu, séparées ici pour ne montrer que ce dont le
   *  vendeur/valideur a besoin sur le moment. */
  readonly activeTab = signal<'vente' | 'validation'>('vente');

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
  /** Type sélectionné en mode ÉDITION uniquement (une place existante, un seul type) — voir
   *  startEdit()/cancelEdit(). La vente (création) utilise saleLines ci-dessous, en panier. */
  readonly selectedTicketTypeId = signal<number | null>(null);

  /** Tarifs de l'event (voir EventTicketPriceController) — non filtré ici pour distinguer un
   *  event sans AUCUN type configuré (message dédié) d'un simple type non proposé. */
  readonly ticketPrices = signal<EventTicketPrice[]>([]);
  /** Seuls les types avec un prix non-null sont vendables — voir sellableTicketTypes(). */
  readonly sellableTicketTypes = computed(() => this.ticketPrices().filter((row) => row.price !== null));

  /** Panier de vente (création uniquement) : une ligne par type de place, pour pouvoir vendre
   *  d'un coup plusieurs types différents à la même personne (ex. 2 Adulte + 1 Étudiant) — même
   *  pattern "plusieurs lignes ajoutables" que pendingDates côté event-detail.ts. */
  readonly saleLines = signal<SaleLine[]>([{ event_ticket_type_id: null, quantity: 1 }]);
  /** Lignes réellement vendables : un type choisi et une quantité positive. */
  private readonly validSaleLines = computed(() =>
    this.saleLines().filter((line): line is { event_ticket_type_id: number; quantity: number } => line.event_ticket_type_id !== null && line.quantity > 0),
  );
  readonly saleLinesQuantity = computed(() => this.validSaleLines().reduce((sum, line) => sum + line.quantity, 0));
  readonly saleLinesTotal = computed(() =>
    this.validSaleLines().reduce((sum, line) => {
      const price = this.sellableTicketTypes().find((row) => row.event_ticket_type_id === line.event_ticket_type_id)?.price;
      return sum + (price === undefined ? 0 : Number(price) * line.quantity);
    }, 0),
  );

  readonly editingTicketId = signal<number | null>(null);
  /** La place en cours d'édition — sert à savoir si elle est déjà payée (voir template, type non
   *  modifiable dans ce cas, même contrainte que côté API). */
  readonly editingTicket = computed(() => this.tickets().find((t) => t.id === this.editingTicketId()) ?? null);
  readonly saving = signal(false);
  readonly sellError = signal<string | null>(null);
  readonly lastSoldCodes = signal<string[]>([]);
  readonly lastSoldTickets = signal<EventTicket[]>([]);

  // --- Modale de paiement (voir EventTicketController::pay) — dédiée, plus simple que le panier
  // POS Vente directe : un seul moyen de paiement, montant toujours resommé depuis les places. ---
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly payingTickets = signal<EventTicket[]>([]);
  readonly showPayModal = signal(false);
  readonly selectedPaymentMethodId = signal<number | null>(null);
  readonly paying = signal(false);
  readonly payError = signal<string | null>(null);

  /** Place(s) vendue(s) avant l'ajout des types/tarifs : pas de prix connu côté serveur, le
   *  vendeur doit saisir le montant lui-même (voir manualAmount, EventTicketController::pay). */
  readonly hasUnknownPrice = computed(() => this.payingTickets().some((t) => t.price === null));
  readonly manualAmount = signal<number | null>(null);

  readonly payTotal = computed(() =>
    this.hasUnknownPrice()
      ? (this.manualAmount() ?? 0)
      : this.payingTickets().reduce((sum, t) => sum + Number(t.price ?? 0), 0),
  );

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

  /** Une salle attachée à l'occurrence (room_id non null) impose de choisir une place sur le
   *  plan avant de valider — voir submitValidation(). Ne concerne que ce dashboard : l'API
   *  (EventTicketController::validateCode) garde table_id nullable pour erp_validate_event, qui
   *  valide d'abord puis assigne une place séparément via assignTable. */
  readonly isStrictPlacement = computed(() => this.eventDate()?.room_id != null);

  constructor() {
    this.eventDateService.get(this.eventDateId).subscribe((eventDate) => {
      this.eventDate.set(eventDate);
      // Le canvas n'existe dans le DOM (@if eventDate()?.room_id) qu'une fois la salle chargée —
      // laisser Angular rendre avant d'y attacher le ResizeObserver.
      setTimeout(() => this.observeCanvas());
      this.ticketPriceService.list(eventDate.event_id).subscribe((prices) => this.ticketPrices.set(prices));
    });
    this.refreshTickets();
    this.paymentMethodService.list().subscribe((methods) => this.paymentMethods.set(methods));

    this.clientSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => this.clientService.search(query)),
      )
      .subscribe((results) => this.clientResults.set(results));
  }

  setActiveTab(tab: 'vente' | 'validation'): void {
    if (tab !== 'validation' && this.scanning()) {
      this.stopScan();
    }
    this.activeTab.set(tab);

    // Le plan de salle (#canvas) n'existe dans le DOM que sous l'onglet "Valider une place" —
    // sans ça, computeFitScale() ne voit jamais le vrai conteneur (reste à 0×0, scale() retombe
    // sur 1 par défaut) et le plan s'affiche à sa taille réelle en pixels au lieu d'être réduit
    // pour tenir dans la carte (bug signalé : "elle s'affiche trop grande"). Laisser Angular
    // rendre avant d'attacher le ResizeObserver, même principe que dans le constructeur.
    if (tab === 'validation') {
      setTimeout(() => this.observeCanvas());
    }
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
    this.selectedTicketTypeId.set(ticket.event_ticket_type_id);
    this.sellError.set(null);
    this.lastSoldCodes.set([]);
  }

  cancelEdit(): void {
    this.editingTicketId.set(null);
    this.selectedClient.set(null);
    this.selectedTicketTypeId.set(null);
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

  /** Ouvre la modale d'encaissement pour les places passées (voir EventTicketController::pay) —
   *  places sans prix connu (vendues avant l'ajout des types/tarifs) incluses : la modale demande
   *  alors un montant manuel (voir hasUnknownPrice/manualAmount). */
  openPayModal(tickets: EventTicket[]): void {
    const payable = tickets.filter((t) => !t.ticket_line_id);
    if (payable.length === 0) {
      return;
    }

    this.payingTickets.set(payable);
    this.selectedPaymentMethodId.set(null);
    this.manualAmount.set(null);
    this.payError.set(null);
    this.showPayModal.set(true);
  }

  closePayModal(): void {
    this.showPayModal.set(false);
    this.payingTickets.set([]);
    this.selectedPaymentMethodId.set(null);
    this.manualAmount.set(null);
    this.payError.set(null);
  }

  confirmPayment(): void {
    const methodId = this.selectedPaymentMethodId();
    const tickets = this.payingTickets();
    if (!methodId || tickets.length === 0 || (this.hasUnknownPrice() && !this.manualAmount())) {
      return;
    }

    this.paying.set(true);
    this.payError.set(null);

    this.eventTicketService
      .pay({
        event_ticket_ids: tickets.map((t) => t.id),
        payment_method_id: methodId,
        cash_session_id: this.activeCashierService.activeSession()?.id ?? null,
        amount: this.hasUnknownPrice() ? this.manualAmount() : null,
      })
      .subscribe({
        next: () => {
          this.paying.set(false);
          this.closePayModal();
          this.refreshTickets();
        },
        error: (err) => {
          this.paying.set(false);
          this.payError.set(err.error?.message ?? "Impossible d'enregistrer le paiement.");
        },
      });
  }

  /** Ajoute une ligne au panier de vente — même pattern que addPendingRow() côté event-detail.ts. */
  addSaleLine(): void {
    this.saleLines.set([...this.saleLines(), { event_ticket_type_id: null, quantity: 1 }]);
  }

  removeSaleLine(index: number): void {
    const lines = this.saleLines();
    if (lines.length <= 1) {
      return;
    }
    this.saleLines.set(lines.filter((_, i) => i !== index));
  }

  updateSaleLine(index: number, patch: Partial<SaleLine>): void {
    this.saleLines.set(this.saleLines().map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  submitSale(): void {
    const client = this.selectedClient();
    const editingId = this.editingTicketId();

    if (!client) {
      return;
    }

    this.sellError.set(null);
    this.saving.set(true);

    if (editingId !== null) {
      this.eventTicketService.update(editingId, { client_id: client.id, event_ticket_type_id: this.selectedTicketTypeId() }).subscribe({
        next: () => {
          this.saving.set(false);
          this.selectedClient.set(null);
          this.selectedTicketTypeId.set(null);
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

    const lines = this.validSaleLines();
    if (lines.length === 0) {
      this.saving.set(false);
      return;
    }

    // Une requête par type de place (pas de vrai "groupe" en base, voir discussion) — regroupées
    // avec forkJoin comme le multi-ajout de dates côté event-detail.ts::submitDates.
    forkJoin(
      lines.map((line) =>
        this.eventTicketService.create({
          event_date_id: this.eventDateId,
          client_id: client.id,
          event_ticket_type_id: line.event_ticket_type_id,
          send_email: this.sendEmail(),
          quantity: line.quantity,
        }),
      ),
    ).subscribe({
      next: (results) => {
        const tickets = results.flat();
        this.saving.set(false);
        this.selectedClient.set(null);
        this.sendEmail.set(true);
        this.saleLines.set([{ event_ticket_type_id: null, quantity: 1 }]);
        this.lastSoldCodes.set(tickets.map((t) => t.validation_code));
        this.lastSoldTickets.set(tickets);
        this.refreshTickets();
      },
      error: (err) => {
        this.saving.set(false);
        this.sellError.set(err.error?.message ?? "Impossible d'enregistrer la vente.");
        // Une partie a pu réussir avant l'échec d'une autre ligne (pas de transaction unique
        // entre plusieurs types, voir docblock de la classe) — recharger pour refléter l'état réel.
        this.refreshTickets();
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

    if (this.isStrictPlacement() && this.selectedTableId() === null) {
      this.validateError.set('Sélectionne une place libre sur le plan avant de valider.');
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
