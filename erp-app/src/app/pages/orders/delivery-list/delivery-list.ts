import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { OrderService } from '../../../core/order.service';
import { Order } from '../../../core/models/order.model';
import { KitchenEchoService } from '../../../core/kitchen-echo.service';
import { formatMoney } from '../../../core/ticket-print.util';

/**
 * "Livraison" (voir gestion-home.ts) : vue filtrée de la même liste que "Gestion des commandes"
 * (voir order-list.ts, dont cette page reprend le pattern général — même
 * OrderService/KitchenEchoService, GET /orders non filtré côté API, filtrage ici en client) —
 * uniquement les commandes boutique en ligne (`source === 'public_shop'`) à livrer
 * (`fulfillment_type === 'delivery'`, voir App\Support\ShopSaleRecorder côté API). Contrairement à
 * "Gestion des commandes"/Kitchen Display, ces commandes n'ont PAS de suivi poste/passe (voir
 * erp_kitchen_display > kitchen-board.ts, qui les exclut volontairement) — leur avancement se
 * pilote uniquement ici via `delivery_status` (voir advanceStatus() et
 * OrderController::updateDeliveryStatus côté API) : pending -> out_for_delivery -> delivered,
 * ce dernier palier supprimant l'Order (déjà payée via son Ticket).
 */
@Component({
  selector: 'app-delivery-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './delivery-list.html',
})
export class DeliveryList {
  private readonly orderService = inject(OrderService);
  private readonly kitchenEcho = inject(KitchenEchoService);

  private readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly formatMoney = formatMoney;

  /** 'all' = pas de filtre — les commandes 'delivered' ne sont de toute façon jamais listées ici
   *  (voir docblock de classe : ce statut supprime l'Order), donc pas d'onglet dédié pour lui. */
  readonly statusFilter = signal<'all' | 'pending' | 'out_for_delivery'>('all');

  private readonly allDeliveries = computed(() =>
    this.orders().filter((order) => order.source === 'public_shop' && order.fulfillment_type === 'delivery'),
  );

  readonly deliveries = computed(() => {
    const filter = this.statusFilter();
    return this.allDeliveries().filter((order) => filter === 'all' || order.delivery_status === filter);
  });

  /** Compteurs affichés sur les onglets — toujours calculés sur la liste complète (pas déjà
   *  filtrée), sinon un onglet non actif afficherait toujours 0. */
  readonly allCount = computed(() => this.allDeliveries().length);
  readonly pendingCount = computed(() => this.allDeliveries().filter((order) => order.delivery_status === 'pending').length);
  readonly outForDeliveryCount = computed(() => this.allDeliveries().filter((order) => order.delivery_status === 'out_for_delivery').length);

  constructor() {
    this.refresh();

    this.kitchenEcho.listen();
    this.kitchenEcho.orderUpdated.pipe(takeUntilDestroyed()).subscribe(() => this.refresh());
  }

  /** Une ligne de correction (voir OrderController::correction) est stockée avec une quantity
   *  POSITIVE — c'est ici que son effet sur le total est inversé, jamais en base. Sans objet en
   *  pratique pour une commande boutique en ligne (jamais corrigée après coup), gardé pour rester
   *  cohérent avec order-list.ts::orderTotal. */
  orderTotal(order: Order): number {
    return order.sections.reduce(
      (sum, section) =>
        sum +
        section.lines.reduce(
          (lineSum, line) => lineSum + (line.is_correction ? -1 : 1) * Number(line.product?.price ?? 0) * line.quantity,
          0,
        ),
      0,
    );
  }

  statusLabel(order: Order): string {
    switch (order.delivery_status) {
      case 'out_for_delivery':
        return 'En livraison';
      case 'pending':
      default:
        return 'À préparer';
    }
  }

  /** Bouton d'action unique par étape — le libellé porte la PROCHAINE étape, pas l'état courant
   *  (voir statusLabel() pour ça), même principe que kitchen-board.ts::canSend/canMarkDone. */
  nextActionLabel(order: Order): string {
    return order.delivery_status === 'out_for_delivery' ? '✅ Marquer livrée' : '🚚 Marquer en livraison';
  }

  advanceStatus(order: Order): void {
    const nextStatus = order.delivery_status === 'out_for_delivery' ? 'delivered' : 'out_for_delivery';
    this.orderService.updateDeliveryStatus(order.id, nextStatus).subscribe({
      // Pas de refresh() manuel ici : OrderKitchenUpdated (voir OrderController::updateDeliveryStatus
      // côté API) déclenche déjà kitchenEcho.orderUpdated ci-dessus, même principe que le reste
      // de cette page.
      error: () => this.error.set("Impossible de mettre à jour le statut de livraison."),
    });
  }

  private refresh(): void {
    this.orderService.list().subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Impossible de charger les commandes.');
      },
    });
  }
}
