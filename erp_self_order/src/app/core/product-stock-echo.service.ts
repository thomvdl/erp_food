import { Injectable, OnDestroy } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { Subject } from 'rxjs';
import { REVERB_APP_KEY, REVERB_HOST, REVERB_PORT } from './reverb-config';

/**
 * Canal public "products" (voir App\Events\ProductStockUpdated côté erp-api) : diffusé à chaque
 * changement de stock d'un produit SUIVI (vente réelle ailleurs dans l'ERP, ou
 * réapprovisionnement manuel depuis erp-app > Paramètres > Produits) — jamais pour un produit à
 * stock non suivi. Utilisé par order.ts pour dégriser/griser une tuile produit en direct pendant
 * que le client compose sa commande, sans qu'il ait à re-scanner le QR. Première connexion
 * WebSocket de cette app (jusqu'ici 100% REST, aucune authentification) — canal public, ne
 * nécessite aucun token.
 */
@Injectable({ providedIn: 'root' })
export class ProductStockEchoService implements OnDestroy {
  private echo: Echo<'reverb'> | null = null;
  private readonly updates$ = new Subject<{ productId: number; stockQuantity: number | null }>();

  readonly stockUpdated = this.updates$.asObservable();

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

    this.echo
      .channel('products')
      .listen('.product.stock-updated', (payload: { productId: number; stockQuantity: number | null }) => {
        this.updates$.next(payload);
      });
  }

  ngOnDestroy(): void {
    this.echo?.disconnect();
  }
}
