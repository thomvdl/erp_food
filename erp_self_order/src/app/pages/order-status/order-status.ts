import { Component, OnDestroy, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { KitchenEchoService } from '../../core/kitchen-echo.service';
import { OrderStatusService } from '../../core/order-status.service';

/**
 * "Un écran visible par les clients pour voir où en est leur commande" (voir Readme.md) — pensé
 * pour un moniteur/TV près du comptoir, pas un usage par-client (pas d'authentification, pas de
 * filtrage sur UN client précis : tout le monde voit tous les numéros en cours, comme un vrai
 * tableau de fast-food). Le numéro affiché est celui du Ticket déjà remis au client (reçu
 * imprimé/affiché au kiosque, voir kiosk-order.ts), pas un id interne. Rafraîchi en direct via le
 * canal public "kitchen" (même canal qu'erp_kitchen_display) — poll de secours en plus, au cas où
 * la connexion websocket tombe sur un écran qui reste ouvert des heures sans surveillance.
 */
@Component({
  selector: 'app-order-status',
  imports: [],
  templateUrl: './order-status.html',
  styleUrl: './order-status.css',
})
export class OrderStatus implements OnDestroy {
  private readonly orderStatusService = inject(OrderStatusService);
  private readonly kitchenEcho = inject(KitchenEchoService);

  private static readonly POLL_INTERVAL_MS = 15000;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  readonly preparing = signal<number[]>([]);
  readonly ready = signal<number[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.refresh();

    this.kitchenEcho.listen();
    this.kitchenEcho.updated.pipe(takeUntilDestroyed()).subscribe(() => this.refresh());

    this.pollInterval = setInterval(() => this.refresh(), OrderStatus.POLL_INTERVAL_MS);
  }

  private refresh(): void {
    this.orderStatusService.get().subscribe({
      next: (board) => {
        this.preparing.set(board.preparing);
        this.ready.set(board.ready);
        this.loading.set(false);
        this.error.set(null);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Impossible de charger le suivi des commandes.');
      },
    });
  }

  ngOnDestroy(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
    }
  }
}
