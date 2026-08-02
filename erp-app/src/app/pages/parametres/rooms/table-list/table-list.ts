import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RoomService } from '../../../../core/room.service';
import { TableElementService } from '../../../../core/table-element.service';
import { Room, TableElement } from '../../../../core/models/floor-plan.model';
import { TableQrModal } from '../table-qr-modal/table-qr-modal';

/**
 * "Possibilité d'afficher une liste de table" — vue alternative au plan visuel
 * (floor-plan-editor), plus pratique pour parcourir/imprimer les QR self-order de toutes les
 * tables d'une salle sans devoir cliquer une à une sur le canvas. Ne montre que les éléments de
 * type 'table' (murs/textes ne sont pas des tables, voir floor-plan.model.ts).
 */
@Component({
  selector: 'app-table-list',
  imports: [RouterLink, TableQrModal],
  templateUrl: './table-list.html',
})
export class TableList {
  private readonly roomService = inject(RoomService);
  private readonly tableElementService = inject(TableElementService);
  private readonly route = inject(ActivatedRoute);

  private readonly roomId = Number(this.route.snapshot.paramMap.get('id'));

  readonly room = signal<Room | null>(null);
  readonly tables = signal<TableElement[]>([]);
  readonly error = signal<string | null>(null);
  readonly qrTable = signal<TableElement | null>(null);

  constructor() {
    this.roomService.get(this.roomId).subscribe({
      next: (room) => {
        this.room.set(room);
        this.tables.set((room.tables ?? []).filter((table) => table.type === 'table'));
      },
      error: () => this.error.set('Impossible de charger la salle.'),
    });
  }

  /** type/pos_left/pos_top/width/height sont "required" côté API (voir
   *  TableElementController::validated) — on doit les renvoyer même si seul `active` change,
   *  même limitation que floor-plan-editor.ts::persist(). */
  toggleActive(table: TableElement): void {
    const active = !table.active;
    this.tables.set(this.tables().map((t) => (t.id === table.id ? { ...t, active } : t)));
    this.tableElementService
      .update(table.id, {
        type: table.type,
        label: table.label,
        pos_left: table.pos_left,
        pos_top: table.pos_top,
        width: table.width,
        height: table.height,
        active,
      })
      .subscribe({
        error: () => this.error.set('Impossible de mettre à jour la table.'),
      });
  }

  openQr(table: TableElement): void {
    this.qrTable.set(table);
  }
}
