import { Injectable, OnDestroy } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { Subject } from 'rxjs';
import { REVERB_APP_KEY, REVERB_HOST, REVERB_PORT } from './reverb-config';

export type KioskPaymentEvent = 'paid' | 'failed';

/**
 * Canal public "kiosk-checkout.{id}" (voir KioskCheckoutPaid/KioskCheckoutFailed côté erp-api,
 * aucune auth requise — même principe que le canal "kitchen" public, voir kitchen-echo.service.ts,
 * dont ce service reprend la structure). Contrairement au canal kitchen (fixe, un seul abonnement
 * pour toute la durée de vie de l'app), ici l'id change à chaque nouvelle tentative de paiement QR
 * — `listen()` quitte l'éventuel canal précédent avant de s'abonner au suivant, un seul checkout
 * actif à la fois sur un kiosque.
 */
@Injectable({ providedIn: 'root' })
export class KioskPaymentEchoService implements OnDestroy {
  private echo: Echo<'reverb'> | null = null;
  private currentChannelName: string | null = null;
  private readonly events$ = new Subject<KioskPaymentEvent>();

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

    this.currentChannelName = `kiosk-checkout.${checkoutId}`;
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
