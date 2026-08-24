import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { OrderService } from '../../../core/order.service';
import { Order } from '../../../core/models/order.model';
import { KitchenEchoService } from '../../../core/kitchen-echo.service';
import { formatMoney } from '../../../core/ticket-print.util';

/**
 * Détail d'une commande à livrer (voir delivery-list.ts, dont le bouton "Voir" mène ici plutôt
 * qu'à une modale — une vraie page pour porter ses propres actions, notamment l'impression de
 * l'adresse de livraison ci-dessous). Se rafraîchit en direct comme le reste des pages Gestion
 * (voir kitchenEcho) : si la commande disparaît pendant la consultation (marquée livrée depuis
 * un autre poste), le fetch échoue en 404 et la page l'affiche comme telle plutôt que de planter.
 */
@Component({
  selector: 'app-delivery-detail',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './delivery-detail.html',
})
export class DeliveryDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orderService = inject(OrderService);
  private readonly kitchenEcho = inject(KitchenEchoService);

  private readonly orderId = Number(this.route.snapshot.paramMap.get('id'));

  readonly order = signal<Order | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly formatMoney = formatMoney;

  constructor() {
    this.refresh();

    this.kitchenEcho.listen();
    this.kitchenEcho.orderUpdated.pipe(takeUntilDestroyed()).subscribe(() => this.refresh());
  }

  lineTotal(line: Order['sections'][number]['lines'][number]): number {
    return (line.is_correction ? -1 : 1) * Number(line.product?.price ?? 0) * line.quantity;
  }

  orderTotal(order: Order): number {
    return order.sections.reduce(
      (sum, section) => sum + section.lines.reduce((lineSum, line) => lineSum + this.lineTotal(line), 0),
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

  nextActionLabel(order: Order): string {
    return order.delivery_status === 'out_for_delivery' ? '✅ Marquer livrée' : '🚚 Marquer en livraison';
  }

  advanceStatus(order: Order): void {
    const nextStatus = order.delivery_status === 'out_for_delivery' ? 'delivered' : 'out_for_delivery';
    this.orderService.updateDeliveryStatus(order.id, nextStatus).subscribe({
      next: (res) => {
        // 'delivered' supprime la commande côté backend (voir OrderService::updateDeliveryStatus)
        // — retour à la liste plutôt que de rester sur une page qui n'a plus d'objet à afficher.
        if ('deleted' in res) {
          this.router.navigateByUrl('/gestion/livraison');
        }
      },
      error: () => this.error.set('Impossible de mettre à jour le statut de livraison.'),
    });
  }

  printAddress(): void {
    window.print();
  }

  private refresh(): void {
    this.orderService.get(this.orderId).subscribe({
      next: (order) => {
        this.order.set(order);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.order.set(null);
        this.error.set('Commande introuvable — elle a peut-être déjà été livrée.');
      },
    });
  }
}
