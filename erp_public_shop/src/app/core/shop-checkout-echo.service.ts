import { Injectable, OnDestroy } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { Subject } from 'rxjs';
import { REVERB_APP_KEY, REVERB_HOST, REVERB_PORT } from './reverb-config';

export type ShopCheckoutEvent = 'paid' | 'failed';

/**
 * Canal public "shop-checkout.{id}" (voir ShopCheckoutPaid/ShopCheckoutFailed côté erp-api,
 * aucune auth requise) — mirror direct de kiosk-payment-echo.service.ts (erp_kiosk) : l'id change
 * à chaque nouvelle tentative de paiement, `listen()` quitte l'éventuel canal précédent avant de
 * s'abonner au suivant.
 */
@Injectable({ providedIn: 'root' })
export class ShopCheckoutEchoService implements OnDestroy {
  private echo: Echo<'reverb'> | null = null;
  private currentChannelName: string | null = null;
  private readonly events$ = new Subject<ShopCheckoutEvent>();

  readonly events = this.events$.asObservable();

  listen(checkoutId: number): void {
    this.stopListening();

    if (!this.echo) {
      (window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;

      this.echo = new Echo({
        broadcaster: 'reverb',
        key: REVERB_APP_KEY,
        wsHost: REVERB_HOST,
        wsPort: REVERB_PORT,
        wssPort: REVERB_PORT,
        forceTLS: window.location.protocol === 'https:',
        enabledTransports: ['ws', 'wss'],
      });
    }

    this.currentChannelName = `shop-checkout.${checkoutId}`;
    this.echo
      .channel(this.currentChannelName)
      .listen('.checkout.paid', () => this.events$.next('paid'))
      .listen('.checkout.failed', () => this.events$.next('failed'));
  }

  stopListening(): void {
    if (this.echo && this.currentChannelName) {
      this.echo.leaveChannel(this.currentChannelName);
    }
    this.currentChannelName = null;
  }

  ngOnDestroy(): void {
    this.stopListening();
    this.echo?.disconnect();
  }
}
