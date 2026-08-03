import { Injectable, OnDestroy } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { Subject } from 'rxjs';
import { REVERB_APP_KEY, REVERB_HOST, REVERB_PORT } from './reverb-config';

/**
 * Canal public "kitchen" (voir OrderKitchenUpdated côté erp-api, aucune auth requise — même canal
 * qu'écoutent déjà erp-app et erp_kitchen_display). Utilisé ici par la page order-status pour
 * rafraîchir le tableau "en préparation / prêt" en direct, sans polling — dupliqué depuis
 * erp_kitchen_display/core/kitchen-echo.service.ts (workspaces Angular séparés).
 */
@Injectable({ providedIn: 'root' })
export class KitchenEchoService implements OnDestroy {
  private echo: Echo<'reverb'> | null = null;
  private readonly updates$ = new Subject<void>();

  readonly updated = this.updates$.asObservable();

  listen(): void {
    if (this.echo) {
      return;
    }

    (window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;

    this.echo = new Echo({
      broadcaster: 'reverb',
      key: REVERB_APP_KEY,
      wsHost: REVERB_HOST,
      wsPort: REVERB_PORT,
      wssPort: REVERB_PORT,
      forceTLS: false,
      enabledTransports: ['ws', 'wss'],
    });

    this.echo.channel('kitchen').listen('.order.updated', () => this.updates$.next());
  }

  ngOnDestroy(): void {
    this.echo?.disconnect();
  }
}
