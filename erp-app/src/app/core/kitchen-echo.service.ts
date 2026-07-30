import { Injectable, OnDestroy } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { Subject } from 'rxjs';
import { REVERB_APP_KEY, REVERB_HOST, REVERB_PORT } from './reverb-config';

/**
 * Canal "kitchen" (voir OrderKitchenUpdated côté erp-api) : diffusé à chaque mutation d'une Order,
 * pas seulement les transitions cuisine — voir le docblock de l'événement côté backend. Utilisé
 * par POS - Restaurant pour deux besoins (voir Readme.md : "synchroniser les différentes instances
 * de POS - Restaurant") :
 *   - table-select.ts : rafraîchit la liste des tables occupées/libres sur TOUT événement (ignore
 *     le payload, même pattern que kitchen-board.ts côté erp_kitchen_display).
 *   - order-builder.ts : ne rafraîchit que si `orderId` correspond à la commande actuellement
 *     ouverte (voir `orderUpdated`).
 * Canal public : pas de scope par utilisateur, toutes les instances de POS - Restaurant partagent
 * la même vue.
 */
@Injectable({ providedIn: 'root' })
export class KitchenEchoService implements OnDestroy {
  private echo: Echo<'reverb'> | null = null;
  private readonly updates$ = new Subject<number>();

  /** Émet l'id de la commande mise à jour à chaque événement reçu sur le canal "kitchen". */
  readonly orderUpdated = this.updates$.asObservable();

  private connect(): void {
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

    this.echo.channel('kitchen').listen('.order.updated', (payload: { orderId: number }) => {
      this.updates$.next(payload.orderId);
    });
  }

  /** À appeler par les pages POS - Restaurant qui veulent réagir aux mises à jour cuisine. */
  listen(): void {
    this.connect();
  }

  ngOnDestroy(): void {
    this.echo?.disconnect();
  }
}
