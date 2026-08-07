import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { OrderService } from '../../../core/order.service';
import { Order } from '../../../core/models/order.model';
import { KitchenEchoService } from '../../../core/kitchen-echo.service';
import { formatMoney } from '../../../core/ticket-print.util';

/**
 * "Gestion des commandes" : toutes les tables actuellement ouvertes (POS - Restaurant), en liste
 * plutôt qu'en plan de salle (voir table-select.ts pour la vue plan) — pratique pour un manager
 * qui veut un coup d'œil global sans naviguer salle par salle. Se rafraîchit en direct via
 * Laravel Echo/Reverb (canal "kitchen", voir Readme.md) sur tout événement, comme table-select.ts
 * et kitchen-board.ts : pas de filtrage par id, un simple refetch complet à chaque mutation
 * (table ouverte/payée, section validée, produit ajouté...).
 */
@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './order-list.html',
})
export class OrderList {
  private readonly orderService = inject(OrderService);
  private readonly kitchenEcho = inject(KitchenEchoService);

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly formatMoney = formatMoney;

  constructor() {
    this.refresh();

    this.kitchenEcho.listen();
    this.kitchenEcho.orderUpdated.pipe(takeUntilDestroyed()).subscribe(() => this.refresh());
  }

  /** Une ligne de correction (voir OrderController::correction) est stockée avec une quantity
   *  POSITIVE — c'est ici que son effet sur le total est inversé, jamais en base. */
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

  /** "2/3 sections envoyées" — le repère le plus utile pour savoir si une commande est prête à payer sans ouvrir chaque table. */
  sectionsSummary(order: Order): string {
    const total = order.sections.length;
    const sent = order.sections.filter((section) => section.state === 'seed').length;
    return `${sent}/${total} section${total > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}`;
  }

  allSectionsSent(order: Order): boolean {
    return order.sections.length > 0 && order.sections.every((section) => section.state === 'seed');
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
