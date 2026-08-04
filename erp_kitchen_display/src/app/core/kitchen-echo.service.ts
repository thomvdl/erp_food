import { Injectable, OnDestroy } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { Subject } from 'rxjs';
import { REVERB_APP_KEY, REVERB_HOST, REVERB_PORT } from './reverb-config';

/**
 * Canal "kitchen" (voir OrderKitchenUpdated côté erp-api) : diffusé à chaque transition d'état
 * pertinente (section demandée/faite, commande envoyée/annulée, table ouverte). Le kitchen
 * display recharge toute la liste des commandes à chaque événement plutôt que de patcher un
 * item précis — cohérent avec le reste du projet (order-builder recharge toujours tout après une
 * mutation), et la liste entière tient largement en une requête pour ce volume de données.
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
      forceTLS: window.location.protocol === 'https:',
      enabledTransports: ['ws', 'wss'],
    });

    this.echo.channel('kitchen').listen('.order.updated', () => this.updates$.next());
  }

  ngOnDestroy(): void {
    this.echo?.disconnect();
  }
}
