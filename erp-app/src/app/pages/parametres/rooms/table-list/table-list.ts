import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, forkJoin, map, switchMap } from 'rxjs';
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

  readonly selectedIds = signal<Set<number>>(new Set());
  readonly printing = signal(false);

  readonly allSelected = computed(() => this.tables().length > 0 && this.tables().every((table) => this.selectedIds().has(table.id)));

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

  isSelected(table: TableElement): boolean {
    return this.selectedIds().has(table.id);
  }

  toggleSelect(table: TableElement): void {
    const next = new Set(this.selectedIds());
    if (next.has(table.id)) {
      next.delete(table.id);
    } else {
      next.add(table.id);
    }
    this.selectedIds.set(next);
  }

  toggleSelectAll(): void {
    this.selectedIds.set(this.allSelected() ? new Set() : new Set(this.tables().map((table) => table.id)));
  }

  /** Un PDF/PNG par table sur sa propre page imprimée (page-break-after), pour ne pas avoir à
   *  ouvrir la popup QR une à une (voir table-qr-modal.ts, dont c'est la version "en lot" — non
   *  factorisée avec elle : ici on assemble plusieurs QR déjà convertis en data URI dans un seul
   *  document imprimé, plutôt qu'un seul). */
  printSelection(): void {
    const selected = this.tables().filter((table) => this.selectedIds().has(table.id));
    if (selected.length === 0 || this.printing()) {
      return;
    }

    this.printing.set(true);
    this.error.set(null);

    forkJoin(
      selected.map((table) =>
        this.tableElementService.getQrBlob(table.id).pipe(
          switchMap((blob) => this.blobToDataUri(blob)),
          map((dataUri) => ({ label: table.label, dataUri })),
        ),
      ),
    ).subscribe({
      next: (items) => {
        this.printing.set(false);
        this.openPrintWindow(items);
      },
      error: () => {
        this.printing.set(false);
        this.error.set('Impossible de charger un ou plusieurs QR codes.');
      },
    });
  }

  private blobToDataUri(blob: Blob): Observable<string> {
    return new Observable<string>((subscriber) => {
      const reader = new FileReader();
      reader.onload = () => {
        subscriber.next(reader.result as string);
        subscriber.complete();
      };
      reader.onerror = () => subscriber.error(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  private openPrintWindow(items: { label: string | null; dataUri: string }[]): void {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return;
    }

    const pages = items
      .map(
        (item) => `
        <section class="qr-page">
          <h1>${item.label ?? ''}</h1>
          <p>Scannez pour commander</p>
          <img src="${item.dataUri}" alt="QR self-order" />
        </section>`,
      )
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="utf-8">
        <title>QR self-order — ${this.room()?.name ?? ''}</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; text-align: center; margin: 0; }
          .qr-page { padding: 40px; page-break-after: always; }
          .qr-page:last-child { page-break-after: auto; }
          h1 { font-size: 20px; }
          p { color: #555; }
          img { width: 260px; height: 260px; margin-top: 16px; }
        </style>
      </head>
      <body>${pages}</body>
      </html>
    `);
    printWindow.document.close();

    const images = Array.from(printWindow.document.images);
    let loaded = 0;
    const onEachLoaded = () => {
      loaded++;
      if (loaded === images.length) {
        printWindow.print();
      }
    };
    images.forEach((img) => (img.complete ? onEachLoaded() : (img.onload = onEachLoaded)));
  }
}
