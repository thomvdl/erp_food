import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RoomService } from '../../../../core/room.service';
import { TableElementService } from '../../../../core/table-element.service';
import { TableElement } from '../../../../core/models/floor-plan.model';

/** Doit correspondre à la grille visuelle du canvas (voir background-size dans le CSS) —
 *  les tables s'y accrochent lors du déplacement/redimensionnement. */
const GRID_SIZE = 20;
const DEFAULT_SIZE = 70;

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
  imports: [FormsModule, RouterLink],
  templateUrl: './floor-plan-editor.html',
  styleUrl: './floor-plan-editor.css',
})
export class FloorPlanEditor {
  private readonly roomService = inject(RoomService);
  private readonly tableElementService = inject(TableElementService);
  private readonly route = inject(ActivatedRoute);

  @ViewChild('canvas') private readonly canvasRef?: ElementRef<HTMLDivElement>;

  private readonly roomId = Number(this.route.snapshot.paramMap.get('id'));

  readonly roomName = signal('');
  readonly tables = signal<TableElement[]>([]);
  readonly selectedId = signal<number | null>(null);
  readonly error = signal<string | null>(null);

  readonly selectedTable = computed(() => this.tables().find((t) => t.id === this.selectedId()) ?? null);

  private dragState: DragState | null = null;
  private resizeState: ResizeState | null = null;

  constructor() {
    this.roomService.get(this.roomId).subscribe({
      next: (room) => {
        this.roomName.set(room.name);
        this.tables.set(room.tables ?? []);
      },
      error: () => this.error.set('Impossible de charger la salle.'),
    });
  }

  addTable(): void {
    const offset = (this.tables().length % 8) * GRID_SIZE;

    const payload: Partial<TableElement> = {
      type: 'table',
      label: this.nextTableLabel(),
      pos_left: 20 + offset,
      pos_top: 20 + offset,
      width: DEFAULT_SIZE,
      height: DEFAULT_SIZE,
    };

    this.tableElementService.create(this.roomId, payload).subscribe({
      next: (table) => {
        this.tables.set([...this.tables(), table]);
        this.selectedId.set(table.id);
      },
      error: () => this.error.set("Impossible d'ajouter la table."),
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

    const bounds = this.canvasBounds();
    const dx = event.clientX - this.dragState.startX;
    const dy = event.clientY - this.dragState.startY;

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

    const dx = event.clientX - this.resizeState.startX;
    const dy = event.clientY - this.resizeState.startY;

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

  private nextTableLabel(): string {
    return `T${this.tables().length + 1}`;
  }

  private snapToGrid(value: number): number {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  }

  private canvasBounds(): { width: number; height: number } | null {
    const el = this.canvasRef?.nativeElement;
    return el ? { width: el.clientWidth, height: el.clientHeight } : null;
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
