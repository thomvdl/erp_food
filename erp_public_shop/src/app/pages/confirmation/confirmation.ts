import { Component, OnDestroy, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { interval } from 'rxjs';
import { CartService } from '../../core/cart.service';
import { ShopService } from '../../core/shop.service';
import { ShopCheckoutEchoService } from '../../core/shop-checkout-echo.service';
import { ShopCheckoutStatus } from '../../core/models/shop.model';
import { CustomerSessionService } from '../../core/customer-session.service';

const POLL_INTERVAL_MS = 4000;

/**
 * Retour de Stripe Checkout (voir ShopCheckoutController::store, success_url/cancel_url) —
 * ?checkout={id}&status=success|cancel. `status` reflète juste l'intention du client au moment de
 * la redirection (a-t-il été jusqu'au bout du formulaire Stripe ou a-t-il annulé) : le VRAI statut
 * du paiement vient toujours de GET /shop/checkouts/{id} (webhook Stripe, asynchrone — voir
 * StripeWebhookController), jamais du paramètre d'URL seul, même principe que
 * KioskCheckoutController::show. Confirmation en temps réel via ShopCheckoutEchoService (canal
 * "shop-checkout.{id}"), avec un polling de secours si le websocket est coupé — mirror du pattern
 * kiosk (voir kiosk-payment-echo.service.ts).
 */
@Component({
  selector: 'app-confirmation',
  imports: [],
  templateUrl: './confirmation.html',
  styleUrl: './confirmation.css',
})
export class Confirmation implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly shopService = inject(ShopService);
  private readonly cart = inject(CartService);
  private readonly checkoutEcho = inject(ShopCheckoutEchoService);
  private readonly customerSession = inject(CustomerSessionService);

  private checkoutId: number | null = null;
  readonly cancelled = signal(false);
  readonly status = signal<ShopCheckoutStatus | null>(null);
  readonly error = signal<string | null>(null);
  private pollSub?: { unsubscribe(): void };

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const id = Number(params.get('checkout'));
    const status = params.get('status');

    if (!id) {
      this.error.set('Confirmation introuvable.');
      return;
    }

    this.checkoutId = id;

    if (status === 'cancel') {
      this.cancelled.set(true);
      return;
    }

    this.fetchStatus();

    this.checkoutEcho.listen(id);
    this.checkoutEcho.events.pipe(takeUntilDestroyed()).subscribe(() => this.fetchStatus());

    // Filet de secours si le websocket est coupé — même principe que kiosk-payment-echo.service.ts.
    this.pollSub = interval(POLL_INTERVAL_MS)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.status()?.status === 'pending') {
          this.fetchStatus();
        }
      });
  }

  private fetchStatus(): void {
    if (!this.checkoutId) return;
    this.shopService.getCheckoutStatus(this.checkoutId).subscribe({
      next: (status) => {
        this.status.set(status);
        if (status.status === 'paid') {
          this.cart.clear();
          this.customerSession.refresh();
        }
      },
      error: () => this.error.set('Impossible de vérifier le statut du paiement.'),
    });
  }

  formatMoney(value: number | string): string {
    return Number(value).toFixed(2) + ' €';
  }

  backToShop(): void {
    this.router.navigateByUrl('/');
  }

  ngOnDestroy(): void {
    this.checkoutEcho.stopListening();
    this.pollSub?.unsubscribe();
  }
}
