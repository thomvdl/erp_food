import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RoomService } from '../../../../core/room.service';
import { TableElementService } from '../../../../core/table-element.service';
import { Room, TableElement, TableElementType } from '../../../../core/models/floor-plan.model';
import { computeFitScale } from '../../../../core/utils/fit-scale';
import { TableQrModal } from '../table-qr-modal/table-qr-modal';

/** Doit correspondre à la grille visuelle du canvas (voir background-size dans le CSS) —
 *  les tables s'y accrochent lors du déplacement/redimensionnement. */
const GRID_SIZE = 20;

/** Taille/libellé par défaut à la création, selon le type d'élément — un mur est pensé comme un
 *  segment allongé plutôt qu'un carré, un texte comme une étiquette large et basse. */
const ELEMENT_DEFAULTS: Record<TableElementType, { width: number; height: number; label: string | null }> = {
  table: { width: 50, height: 50, label: null },
  wall: { width: 120, height: 14, label: null },
  text: { width: 120, height: 28, label: 'Texte' },
};

interface DragState {
  tableId: number;
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
}

interface ResizeState {
  tableId: number;
  pointerId: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

@Component({
  selector: 'app-floor-plan-editor',
  standalone: true,
  imports: [FormsModule, RouterLink, TableQrModal],
  templateUrl: './floor-plan-editor.html',
  styleUrl: './floor-plan-editor.css',
})
export class FloorPlanEditor implements AfterViewInit, OnDestroy {
  private readonly roomService = inject(RoomService);
  private readonly tableElementService = inject(TableElementService);
  private readonly route = inject(ActivatedRoute);

  @ViewChild('canvas') private readonly canvasRef?: ElementRef<HTMLDivElement>;
  private resizeObserver?: ResizeObserver;
  private readonly containerSize = signal({ width: 0, height: 0 });

  private readonly roomId = Number(this.route.snapshot.paramMap.get('id'));

  readonly room = signal<Room | null>(null);
  readonly tables = signal<TableElement[]>([]);
  readonly selectedId = signal<number | null>(null);
  readonly error = signal<string | null>(null);

  readonly selectedTable = computed(() => this.tables().find((t) => t.id === this.selectedId()) ?? null);

  readonly qrTable = signal<TableElement | null>(null);

  /** Échelle du plan pour qu'il tienne toujours dans son conteneur sans barre de défilement —
   *  voir computeFitScale(). Contrairement aux écrans en lecture seule, le drag/resize doit
   *  diviser ses deltas écran par cette échelle pour rester en unités "room" (voir
   *  onTablePointerMove/onResizeHandlePointerMove) — sinon déplacer la souris de 10px déplacerait
   *  la table de 10 unités quelle que soit l'échelle réellement affichée. */
  readonly scale = computed(() => {
    const room = this.room();
    const { width, height } = this.containerSize();
    return room ? computeFitScale(width, height, room.width, room.height) : 1;
  });

  private dragState: DragState | null = null;
  private resizeState: ResizeState | null = null;

  constructor() {
    this.roomService.get(this.roomId).subscribe({
      next: (room) => {
        this.room.set(room);
        this.tables.set(room.tables ?? []);
      },
      error: () => this.error.set('Impossible de charger la salle.'),
    });
  }

  ngAfterViewInit(): void {
    const el = this.canvasRef?.nativeElement;
    if (!el) {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.containerSize.set({ width: el.clientWidth, height: el.clientHeight });
    });
    this.resizeObserver.observe(el);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  /** "Créer des QR code client pour self order" : chaque table a déjà un qr_token (généré à sa
   *  création, voir TableElement::booted() côté API) — ceci ne fait qu'ouvrir la popup qui
   *  affiche/imprime le PNG déjà exposé publiquement par SelfOrderController::qr. */
  openQr(table: TableElement): void {
    this.qrTable.set(table);
  }

  addTable(): void {
    this.addElement('table');
  }

  addWall(): void {
    this.addElement('wall');
  }

  addText(): void {
    this.addElement('text');
  }

  private addElement(type: TableElementType): void {
    const offset = (this.tables().length % 8) * GRID_SIZE;
    const defaults = ELEMENT_DEFAULTS[type];

    const payload: Partial<TableElement> = {
      type,
      label: type === 'table' ? this.nextTableLabel() : defaults.label,
      pos_left: 20 + offset,
      pos_top: 20 + offset,
      width: defaults.width,
      height: defaults.height,
    };

    this.tableElementService.create(this.roomId, payload).subscribe({
      next: (element) => {
        this.tables.set([...this.tables(), element]);
        this.selectedId.set(element.id);
      },
      error: () => this.error.set("Impossible d'ajouter cet élément."),
    });
  }

  selectTable(id: number): void {
    this.selectedId.set(id);
  }

  deselect(): void {
    this.selectedId.set(null);
  }

  updateLabel(label: string): void {
    const id = this.selectedId();
    if (id === null) {
      return;
    }
    this.patchLocal(id, { label });
  }

  saveLabel(): void {
    const id = this.selectedId();
    if (id !== null) {
      this.persist(id);
    }
  }

  /** "Ne plus avoir la possibilité de supprimer... ajouter un champ active" (voir Readme.md) — remplace deleteSelected(). */
  toggleActive(active: boolean): void {
    const id = this.selectedId();
    if (id === null) {
      return;
    }
    this.patchLocal(id, { active });
    this.persist(id);
  }

  onTablePointerDown(event: PointerEvent, table: TableElement): void {
    event.stopPropagation();
    this.selectTable(table.id);

    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    this.dragState = {
      tableId: table.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: table.pos_left,
      startTop: table.pos_top,
    };
  }

  onTablePointerMove(event: PointerEvent): void {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return;
    }

    const table = this.tables().find((t) => t.id === this.dragState!.tableId);
    if (!table) {
      return;
    }

    const bounds = this.room();
    const scale = this.scale();
    const dx = (event.clientX - this.dragState.startX) / scale;
    const dy = (event.clientY - this.dragState.startY) / scale;

    const maxLeft = bounds ? Math.max(0, bounds.width - table.width) : Infinity;
    const maxTop = bounds ? Math.max(0, bounds.height - table.height) : Infinity;

    const snappedLeft = this.snapToGrid(this.dragState.startLeft + dx);
    const snappedTop = this.snapToGrid(this.dragState.startTop + dy);

    this.patchLocal(this.dragState.tableId, {
      pos_left: Math.min(maxLeft, Math.max(0, snappedLeft)),
      pos_top: Math.min(maxTop, Math.max(0, snappedTop)),
    });
  }

  onTablePointerUp(event: PointerEvent): void {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return;
    }

    const id = this.dragState.tableId;
    this.dragState = null;
    this.persist(id);
  }

  onResizeHandlePointerDown(event: PointerEvent, table: TableElement): void {
    event.stopPropagation();
    this.selectTable(table.id);

    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    this.resizeState = {
      tableId: table.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: table.width,
      startHeight: table.height,
    };
  }

  onResizeHandlePointerMove(event: PointerEvent): void {
    if (!this.resizeState || event.pointerId !== this.resizeState.pointerId) {
      return;
    }

    const scale = this.scale();
    const dx = (event.clientX - this.resizeState.startX) / scale;
    const dy = (event.clientY - this.resizeState.startY) / scale;

    this.patchLocal(this.resizeState.tableId, {
      width: Math.max(GRID_SIZE, this.snapToGrid(this.resizeState.startWidth + dx)),
      height: Math.max(GRID_SIZE, this.snapToGrid(this.resizeState.startHeight + dy)),
    });
  }

  onResizeHandlePointerUp(event: PointerEvent): void {
    if (!this.resizeState || event.pointerId !== this.resizeState.pointerId) {
      return;
    }

    const id = this.resizeState.tableId;
    this.resizeState = null;
    this.persist(id);
  }

  /** Label = préfixe de la salle (Room.prefix, facultatif) + numéro (ex. "BAR" -> BAR-1, BAR-2).
   *  Sans préfixe défini sur la salle, retombe sur "T". Le numéro suivant est calculé à partir
   *  du max existant pour ce préfixe (et non un simple compte des tables) pour rester correct
   *  après renommage/désactivation de tables. */
  private nextTableLabel(): string {
    const prefix = (this.room()?.prefix?.trim() || 'T').toUpperCase();

    const numbers = this.tables()
      .filter((t) => t.type === 'table' && t.label?.startsWith(`${prefix}-`))
      .map((t) => Number(t.label!.slice(prefix.length + 1)))
      .filter((n) => Number.isFinite(n));

    const next = numbers.length ? Math.max(...numbers) + 1 : 1;
    return `${prefix}-${next}`;
  }

  private snapToGrid(value: number): number {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  }

  private patchLocal(id: number, patch: Partial<TableElement>): void {
    this.tables.set(this.tables().map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  private persist(id: number): void {
    const table = this.tables().find((t) => t.id === id);
    if (!table) {
      return;
    }

    this.tableElementService
      .update(id, {
        type: table.type,
        label: table.label,
        pos_left: table.pos_left,
        pos_top: table.pos_top,
        width: table.width,
        height: table.height,
        active: table.active,
      })
      .subscribe({
        error: () => this.error.set("Impossible d'enregistrer la position."),
      });
  }
}
