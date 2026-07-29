import { Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import jsQR from 'jsqr';
import { EventDateService } from '../../core/event-date.service';
import { EventTicketService } from '../../core/event-ticket.service';
import { EventDate, EventTicket, TableElement } from '../../core/models/event.model';

type Mode = 'scan' | 'clavier';
type ResultState = 'idle' | 'success' | 'error';

const KEYBOARD_ROWS = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN', '0123456789'];

/** Combien de temps l'écran vert/rouge reste affiché avant de revenir prêt pour le suivant
 *  (sauf si une modal de placement s'ouvre entre-temps — elle bloque le retour à l'idle). */
const RESULT_DISPLAY_MS = 2500;

@Component({
  selector: 'app-event-checkin',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './event-checkin.html',
  styleUrl: './event-checkin.css',
})
export class EventCheckin implements OnDestroy {
  private readonly eventDateService = inject(EventDateService);
  private readonly eventTicketService = inject(EventTicketService);
  private readonly route = inject(ActivatedRoute);

  private readonly eventDateId = Number(this.route.snapshot.paramMap.get('id'));

  readonly keyboardRows = KEYBOARD_ROWS;

  readonly eventDate = signal<EventDate | null>(null);
  readonly tickets = signal<EventTicket[]>([]);

  readonly mode = signal<Mode>('scan');
  readonly code = signal('');
  readonly validating = signal(false);

  readonly resultState = signal<ResultState>('idle');
  readonly resultTitle = signal('');
  readonly resultSubtitle = signal('');

  // Modal de placement — s'ouvre après une validation réussie si l'occurrence a une salle et
  // que le ticket n'a pas déjà de place (voir Readme.md : valider d'abord, choisir le siège ensuite).
  readonly showSeatModal = signal(false);
  readonly pendingTicket = signal<EventTicket | null>(null);
  readonly selectedTableId = signal<number | null>(null);
  readonly assigningTable = signal(false);

  readonly scanning = signal(false);
  readonly scanError = signal<string | null>(null);

  @ViewChild('scanVideo') private readonly scanVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('scanCanvas') private readonly scanCanvasRef?: ElementRef<HTMLCanvasElement>;
  private scanStream: MediaStream | null = null;
  private scanFrameId: number | null = null;
  private resultTimer: ReturnType<typeof setTimeout> | null = null;

  readonly tables = computed<TableElement[]>(() => this.eventDate()?.room?.tables ?? []);

  readonly occupiedByTable = computed(() => {
    const map = new Map<number, EventTicket>();
    for (const ticket of this.tickets()) {
      if (ticket.validated_at && ticket.table_id !== null) {
        map.set(ticket.table_id, ticket);
      }
    }
    return map;
  });

  readonly selectedTableLabel = computed(
    () => this.tables().find((t) => t.id === this.selectedTableId())?.label ?? '',
  );

  constructor() {
    this.eventDateService.get(this.eventDateId).subscribe((eventDate) => {
      this.eventDate.set(eventDate);
      if (eventDate.room_id !== null) {
        this.refreshTickets();
      }
    });

    this.setMode('scan');
  }

  formatDate(eventDate: EventDate): string {
    const [year, month, day] = eventDate.date.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }

  formatHour(eventDate: EventDate): string {
    return eventDate.start_hour.slice(0, 5);
  }

  occupant(table: TableElement): EventTicket | null {
    return this.occupiedByTable().get(table.id) ?? null;
  }

  selectTable(table: TableElement): void {
    if (this.occupant(table)) {
      return;
    }
    this.selectedTableId.set(this.selectedTableId() === table.id ? null : table.id);
  }

  setMode(mode: Mode): void {
    this.mode.set(mode);
    if (mode === 'scan') {
      this.startScan();
    } else {
      this.stopScan();
    }
  }

  // --- Saisie clavier (physique ou virtuel) ---

  pressKey(key: string): void {
    this.code.set((this.code() + key).slice(0, 12));
  }

  backspace(): void {
    this.code.set(this.code().slice(0, -1));
  }

  clearCode(): void {
    this.code.set('');
  }

  submitCode(): void {
    if (!this.code().trim() || this.validating()) {
      return;
    }
    this.validate(this.code().trim());
  }

  // --- Scan QR (caméra) ---

  async startScan(): Promise<void> {
    this.scanError.set(null);

    try {
      this.scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch {
      this.scanError.set("Impossible d'accéder à la caméra (permission refusée ou aucune caméra disponible).");
      return;
    }

    this.scanning.set(true);

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

    if (result?.data && this.canValidateNow()) {
      this.validate(result.data.trim());
    }

    this.scanFrameId = requestAnimationFrame(() => this.scanFrame());
  }

  private canValidateNow(): boolean {
    return this.resultState() === 'idle' && !this.showSeatModal();
  }

  // --- Validation : le code d'abord, la place ensuite via la modal ---

  private validate(code: string): void {
    if (this.validating() || !this.canValidateNow()) {
      return;
    }

    this.validating.set(true);

    this.eventTicketService.validate({ code }).subscribe({
      next: (ticket) => {
        this.validating.set(false);
        this.showResult('success', `${ticket.client?.firstname} ${ticket.client?.lastname}`, 'Accès autorisé');
        this.code.set('');
        this.refreshTickets();

        if (this.eventDate()?.room_id && ticket.table_id === null) {
          this.openSeatModal(ticket);
        }
      },
      error: (err) => {
        this.validating.set(false);
        this.showResult('error', 'Accès refusé', err.error?.message ?? 'Code invalide.');
      },
    });
  }

  // --- Modal de placement ---

  private openSeatModal(ticket: EventTicket): void {
    this.pendingTicket.set(ticket);
    this.selectedTableId.set(null);
    this.showSeatModal.set(true);
  }

  confirmSeat(): void {
    const ticket = this.pendingTicket();
    const tableId = this.selectedTableId();
    if (!ticket || tableId === null) {
      return;
    }

    this.assigningTable.set(true);
    this.eventTicketService.assignTable(ticket.id, tableId).subscribe({
      next: () => {
        this.assigningTable.set(false);
        this.closeSeatModal();
        this.refreshTickets();
      },
      error: (err) => {
        this.assigningTable.set(false);
        this.scanError.set(err.error?.message ?? "Impossible d'attribuer cette place.");
      },
    });
  }

  closeSeatModal(): void {
    this.showSeatModal.set(false);
    this.pendingTicket.set(null);
    this.selectedTableId.set(null);
  }

  private showResult(state: ResultState, title: string, subtitle: string): void {
    this.resultState.set(state);
    this.resultTitle.set(title);
    this.resultSubtitle.set(subtitle);
    state === 'success' ? this.playSuccessSound() : this.playErrorSound();

    if (this.resultTimer) {
      clearTimeout(this.resultTimer);
    }
    this.resultTimer = setTimeout(() => {
      this.resultState.set('idle');
    }, RESULT_DISPLAY_MS);
  }

  // --- Sons de confirmation/refus ---
  // Générés via Web Audio API plutôt que des fichiers audio : rien à héberger/bundler, aucun
  // souci de format, et ça marche même si le kiosque n'a pas d'accès réseau au moment du scan.

  private audioCtx: AudioContext | null = null;

  private playSuccessSound(): void {
    // Deux notes montantes (accord bref, ton "positif") — La5 puis Mi6.
    this.playTone(880, 0.12, 0);
    this.playTone(1318.51, 0.16, 0.11);
  }

  private playErrorSound(): void {
    // Deux notes graves en dents de scie — buzz "refus" plus dur que le succès.
    this.playTone(220, 0.16, 0, 'sawtooth');
    this.playTone(174.61, 0.22, 0.14, 'sawtooth');
  }

  private playTone(frequency: number, duration: number, startOffset: number, type: OscillatorType = 'sine'): void {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;

    const startTime = ctx.currentTime + startOffset;
    gain.gain.setValueAtTime(0.25, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    return this.audioCtx;
  }

  private refreshTickets(): void {
    this.eventTicketService.listForEventDate(this.eventDateId).subscribe((tickets) => this.tickets.set(tickets));
  }

  ngOnDestroy(): void {
    this.stopScan();
    if (this.resultTimer) {
      clearTimeout(this.resultTimer);
    }
    this.audioCtx?.close();
  }
}
