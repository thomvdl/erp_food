import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { OrderService } from '../../../core/order.service';
import { RoomService } from '../../../core/room.service';
import { Order } from '../../../core/models/order.model';
import { Room, TableElement } from '../../../core/models/floor-plan.model';
import { KitchenEchoService } from '../../../core/kitchen-echo.service';
import { computeFitScale } from '../../../core/utils/fit-scale';

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
  imports: [],
  templateUrl: './table-select.html',
  styleUrl: './table-select.css',
})
export class TableSelect implements AfterViewInit, OnDestroy {
  private readonly roomService = inject(RoomService);
  private readonly orderService = inject(OrderService);
  private readonly router = inject(Router);
  private readonly kitchenEcho = inject(KitchenEchoService);

  @ViewChild('canvas') private readonly canvasRef?: ElementRef<HTMLDivElement>;
  private resizeObserver?: ResizeObserver;

  /** Taille réelle (px) du conteneur du plan — mise à jour par ResizeObserver, alimente scale(). */
  private readonly containerSize = signal({ width: 0, height: 0 });

  /** Échelle appliquée au plan (room.width/height) pour qu'il tienne toujours dans son
   *  conteneur sans barre de défilement, quelle que soit la taille de l'écran — voir
   *  computeFitScale(). Recalculée automatiquement au changement de salle ou de taille d'écran. */
  readonly scale = computed(() => {
    const room = this.selectedRoom();
    const { width, height } = this.containerSize();
    return room ? computeFitScale(width, height, room.width, room.height) : 1;
  });

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

  /** Tout élément actif du plan (tables + murs/textes décoratifs, voir floor-plan-editor.ts) —
   *  pour un rendu visuel identique à l'éditeur. Murs/textes restent affichés mais jamais
   *  cliquables/occupables : voir clickTable(), qui les ignore. */
  readonly planElements = computed<TableElement[]>(() => (this.selectedRoom()?.tables ?? []).filter((table) => table.active));

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

      // Le canvas n'existe dans le DOM (@else de loading()) qu'une fois les salles chargées —
      // ngAfterViewInit() se déclenche bien avant (pendant que loading() est encore true), donc
      // trop tôt pour trouver #canvas. Laisser Angular rendre avant d'y attacher le ResizeObserver.
      setTimeout(() => this.observeCanvas());
    });
    this.refreshOrders();

    this.kitchenEcho.listen();
    this.kitchenEcho.orderUpdated.pipe(takeUntilDestroyed()).subscribe(() => this.refreshOrders());
  }

  ngAfterViewInit(): void {
    this.observeCanvas();
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

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  selectRoom(id: number): void {
    this.selectedRoomId.set(id);
  }

  orderForTable(table: TableElement): Order | null {
    return this.orderByTable().get(table.id) ?? null;
  }

  clickTable(table: TableElement): void {
    if (table.type !== 'table') {
      return;
    }

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

  incrementGuestCount(): void {
    this.guestCount.update((n) => n + 1);
  }

  decrementGuestCount(): void {
    this.guestCount.update((n) => Math.max(1, n - 1));
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
