import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OrderService } from '../../../core/order.service';
import { RoomService } from '../../../core/room.service';
import { Order } from '../../../core/models/order.model';
import { Room, TableElement } from '../../../core/models/floor-plan.model';
import { KitchenEchoService } from '../../../core/kitchen-echo.service';

/**
 * Accueil du POS Restaurant (voir Readme.md) : plan de salle en lecture seule (pas d'édition,
 * contrairement à parametres/rooms/floor-plan-editor), un clic sur une table libre demande le
 * nombre de personnes puis ouvre une Order ; un clic sur une table occupée rejoint directement
 * sa commande en cours (order-builder). Rafraîchit l'occupation des tables en temps réel via
 * Reverb (voir Readme.md : "synchroniser les différentes instances de POS - Restaurant quand une
 * table est ouverte ou payée") — sur TOUT événement du canal "kitchen" (une table ouverte/payée
 * ailleurs y déclenche toujours un événement, voir OrderKitchenUpdated côté erp-api), sans
 * regarder quel orderId a changé : un simple refetch de la liste complète, même pattern que
 * kitchen-board.ts.
 */
@Component({
  selector: 'app-table-select',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './table-select.html',
  styleUrl: './table-select.css',
})
export class TableSelect {
  private readonly roomService = inject(RoomService);
  private readonly orderService = inject(OrderService);
  private readonly router = inject(Router);
  private readonly kitchenEcho = inject(KitchenEchoService);

  readonly rooms = signal<Room[]>([]);
  readonly selectedRoomId = signal<number | null>(null);
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);

  readonly openingTable = signal<TableElement | null>(null);
  readonly guestCount = signal(2);
  readonly opening = signal(false);
  readonly error = signal<string | null>(null);

  /** Seules les salles pensées pour le POS Restaurant (voir Room.type) — pas les salles Événement.
   *  Et seulement les salles actives (voir Readme.md, "n'afficher que les éléments actifs"). */
  readonly restaurantRooms = computed(() => this.rooms().filter((room) => room.type === 'restaurant' && room.active));

  readonly selectedRoom = computed(() => this.restaurantRooms().find((room) => room.id === this.selectedRoomId()) ?? null);

  /** Idem pour les tables individuelles d'une salle par ailleurs active. */
  readonly tables = computed<TableElement[]>(() => (this.selectedRoom()?.tables ?? []).filter((table) => table.active));

  private readonly orderByTable = computed(() => {
    const map = new Map<number, Order>();
    for (const order of this.orders()) {
      if (order.table_id !== null) {
        map.set(order.table_id, order);
      }
    }
    return map;
  });

  constructor() {
    this.roomService.list().subscribe((rooms) => {
      this.rooms.set(rooms);
      const restaurantRooms = rooms.filter((room) => room.type === 'restaurant' && room.active);
      if (restaurantRooms.length > 0) {
        this.selectedRoomId.set(restaurantRooms[0].id);
      }
      this.loading.set(false);
    });
    this.refreshOrders();

    this.kitchenEcho.listen();
    this.kitchenEcho.orderUpdated.pipe(takeUntilDestroyed()).subscribe(() => this.refreshOrders());
  }

  selectRoom(id: number): void {
    this.selectedRoomId.set(id);
  }

  orderForTable(table: TableElement): Order | null {
    return this.orderByTable().get(table.id) ?? null;
  }

  clickTable(table: TableElement): void {
    const order = this.orderForTable(table);
    if (order) {
      this.router.navigate(['/pos-restaurant', order.id]);
      return;
    }

    this.openingTable.set(table);
    this.guestCount.set(2);
    this.error.set(null);
  }

  cancelOpenTable(): void {
    this.openingTable.set(null);
  }

  confirmOpenTable(): void {
    const table = this.openingTable();
    if (!table) {
      return;
    }

    this.error.set(null);
    this.opening.set(true);

    this.orderService.open({ table_id: table.id, number_of_guests: this.guestCount() }).subscribe({
      next: (order) => {
        this.opening.set(false);
        this.router.navigate(['/pos-restaurant', order.id]);
      },
      error: (err) => {
        this.opening.set(false);
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.error.set(messages?.length ? messages.join(' ') : "Impossible d'ouvrir cette table.");
        this.refreshOrders();
      },
    });
  }

  private refreshOrders(): void {
    this.orderService.list().subscribe((orders) => this.orders.set(orders));
  }
}
