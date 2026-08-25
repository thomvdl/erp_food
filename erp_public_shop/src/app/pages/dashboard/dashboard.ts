import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClientAddressService } from '../../core/client-address.service';
import { CustomerService } from '../../core/customer.service';
import { CustomerSessionService } from '../../core/customer-session.service';
import { ClientAddress } from '../../core/models/client-address.model';
import { CustomerOrder } from '../../core/models/customer.model';

/**
 * Dashboard "Mon compte" — voir shared/customer-login (lien topbar) et core/auth.guard.ts (garantit
 * qu'on n'arrive jamais ici sans customer). Deux onglets : historique de commandes (voir
 * ShopCustomerController::orders, basé sur les Tickets — seule trace durable, les Order sont
 * supprimées une fois servies/livrées) et adresses enregistrées (voir
 * ShopCustomerAddressController, réutilisées par pages/checkout pour pré-remplir la livraison).
 */
@Component({
  selector: 'app-dashboard',
  imports: [FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private readonly router = inject(Router);
  private readonly customerService = inject(CustomerService);
  private readonly addressService = inject(ClientAddressService);
  readonly session = inject(CustomerSessionService);

  readonly activeTab = signal<'orders' | 'addresses'>('orders');

  readonly orders = signal<CustomerOrder[]>([]);
  readonly ordersLoading = signal(true);
  readonly ordersError = signal<string | null>(null);
  readonly expandedOrderId = signal<number | null>(null);

  readonly addresses = signal<ClientAddress[]>([]);
  readonly addressesLoading = signal(true);
  readonly addressesError = signal<string | null>(null);
  readonly addressBusy = signal(false);
  readonly labelDraft = signal('');
  readonly addressDraft = signal('');
  /** Id de l'adresse en cours d'édition (voir startEdit/cancelEdit) — `null` = formulaire d'ajout
   *  affiché à la place, les deux ne coexistent jamais (mêmes signaux de saisie réutilisés). */
  readonly editingId = signal<number | null>(null);

  constructor() {
    // Garanti non-null par la garde de route (voir docblock ci-dessus) — juste requis pour le
    // typage de customer.phone/email juste en dessous.
    const customer = this.session.customer();
    if (!customer) {
      this.ordersLoading.set(false);
      this.addressesLoading.set(false);
      return;
    }

    this.customerService.getOrders(customer.phone, customer.email).subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.ordersLoading.set(false);
      },
      error: () => {
        this.ordersLoading.set(false);
        this.ordersError.set('Impossible de charger votre historique.');
      },
    });

    this.loadAddresses();
  }

  private loadAddresses(): void {
    const customer = this.session.customer();
    if (!customer) return;

    this.addressesLoading.set(true);
    this.addressService.list(customer.phone, customer.email).subscribe({
      next: (addresses) => {
        this.addresses.set(addresses);
        this.addressesLoading.set(false);
      },
      error: () => {
        this.addressesLoading.set(false);
        this.addressesError.set('Impossible de charger vos adresses.');
      },
    });
  }

  toggleOrder(id: number): void {
    this.expandedOrderId.set(this.expandedOrderId() === id ? null : id);
  }

  formatMoney(value: number | string): string {
    return Number(value).toFixed(2) + ' €';
  }

  formatDate(paidAt: string): string {
    const d = new Date(paidAt);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  itemCount(order: CustomerOrder): number {
    return order.sections.reduce((sum, section) => sum + section.lines.reduce((lineSum, line) => lineSum + line.quantity, 0), 0);
  }

  lineTotal(line: CustomerOrder['sections'][number]['lines'][number]): number {
    return (line.is_correction ? -1 : 1) * Number(line.unit_price) * line.quantity;
  }

  orderTotal(order: CustomerOrder): number {
    return order.sections.reduce((sum, section) => sum + section.lines.reduce((lineSum, line) => lineSum + this.lineTotal(line), 0), 0);
  }

  addAddress(): void {
    const customer = this.session.customer();
    if (!customer || this.addressBusy() || !this.addressDraft().trim()) return;

    this.addressBusy.set(true);
    this.addressesError.set(null);

    this.addressService.create(customer.phone, customer.email, this.labelDraft().trim() || null, this.addressDraft().trim()).subscribe({
      next: () => {
        this.addressBusy.set(false);
        this.labelDraft.set('');
        this.addressDraft.set('');
        this.loadAddresses();
      },
      error: (err) => {
        this.addressBusy.set(false);
        this.addressesError.set(err.error?.errors?.address?.[0] ?? err.error?.message ?? "Impossible d'enregistrer cette adresse.");
      },
    });
  }

  startEdit(address: ClientAddress): void {
    this.editingId.set(address.id);
    this.labelDraft.set(address.label ?? '');
    this.addressDraft.set(address.address);
    this.addressesError.set(null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.labelDraft.set('');
    this.addressDraft.set('');
  }

  saveEdit(): void {
    const customer = this.session.customer();
    const id = this.editingId();
    if (!customer || id === null || this.addressBusy()) return;

    this.addressBusy.set(true);
    this.addressesError.set(null);

    this.addressService.update(id, customer.phone, customer.email, this.labelDraft().trim() || null, this.addressDraft().trim() || null).subscribe({
      next: () => {
        this.addressBusy.set(false);
        this.cancelEdit();
        this.loadAddresses();
      },
      error: (err) => {
        this.addressBusy.set(false);
        this.addressesError.set(err.error?.errors?.address?.[0] ?? err.error?.message ?? 'Impossible de modifier cette adresse.');
      },
    });
  }

  setDefault(address: ClientAddress): void {
    const customer = this.session.customer();
    if (!customer || address.is_default) return;

    this.addressService.setDefault(address.id, customer.phone, customer.email).subscribe({
      next: () => this.loadAddresses(),
    });
  }

  removeAddress(address: ClientAddress): void {
    const customer = this.session.customer();
    if (!customer) return;

    this.addressService.remove(address.id, customer.phone, customer.email).subscribe({
      next: () => this.loadAddresses(),
    });
  }

  back(): void {
    this.router.navigateByUrl('/');
  }
}
