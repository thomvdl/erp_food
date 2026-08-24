import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CustomerService } from '../../core/customer.service';
import { CustomerSessionService } from '../../core/customer-session.service';
import { CustomerOrder } from '../../core/models/customer.model';

/**
 * "Mes commandes" — voir shared/customer-login (lien topbar) et ShopCustomerController::orders
 * côté API. Réservée aux clients connectés (identification par téléphone, voir
 * CustomerSessionService) : redirige vers l'accueil si personne n'est connecté plutôt que
 * d'afficher une page vide, aucune notion de guard de route dans cette app 100% publique.
 */
@Component({
  selector: 'app-order-history',
  imports: [],
  templateUrl: './order-history.html',
  styleUrl: './order-history.css',
})
export class OrderHistory {
  private readonly router = inject(Router);
  private readonly customerService = inject(CustomerService);
  readonly session = inject(CustomerSessionService);

  readonly orders = signal<CustomerOrder[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    const customer = this.session.customer();
    if (!customer) {
      this.router.navigateByUrl('/');
      return;
    }

    this.customerService.getOrders(customer.phone).subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Impossible de charger votre historique.');
      },
    });
  }

  formatMoney(value: number | string): string {
    return Number(value).toFixed(2) + ' €';
  }

  formatDate(paidAt: string): string {
    const d = new Date(paidAt);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  lineTotal(line: CustomerOrder['sections'][number]['lines'][number]): number {
    return (line.is_correction ? -1 : 1) * Number(line.unit_price) * line.quantity;
  }

  orderTotal(order: CustomerOrder): number {
    return order.sections.reduce((sum, section) => sum + section.lines.reduce((lineSum, line) => lineSum + this.lineTotal(line), 0), 0);
  }

  back(): void {
    this.router.navigateByUrl('/');
  }
}
