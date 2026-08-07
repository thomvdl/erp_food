import { Injectable, OnDestroy } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { Subject } from 'rxjs';
import { REVERB_APP_KEY, REVERB_HOST, REVERB_PORT } from './reverb-config';

/**
 * Canal "products" (voir App\Events\ProductStockUpdated côté erp-api) : diffusé à chaque
 * changement de stock d'un produit SUIVI (vente réelle via App\Support\StockManager, ou
 * réapprovisionnement manuel depuis Paramètres > Produits) — jamais pour un produit à stock non
 * suivi. Utilisé par POS - Vente directe et POS - Restaurant pour dégriser/griser une tuile
 * produit en direct sans recharger la liste complète. Canal public, même principe que
 * KitchenEchoService — connexion Echo séparée (canal différent), pas de raison de la fusionner
 * avec le canal "kitchen" qui n'a rien à voir avec le stock.
 */
@Injectable({ providedIn: 'root' })
export class ProductStockEchoService implements OnDestroy {
  private echo: Echo<'reverb'> | null = null;
  private readonly updates$ = new Subject<{ productId: number; stockQuantity: number | null }>();

  /** Émet {productId, stockQuantity} à chaque événement reçu sur le canal "products". */
  readonly stockUpdated = this.updates$.asObservable();

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
      forceTLS: window.location.protocol === 'https:',
      enabledTransports: ['ws', 'wss'],
    });

    this.echo
      .channel('products')
      .listen('.product.stock-updated', (payload: { productId: number; stockQuantity: number | null }) => {
        this.updates$.next(payload);
      });
  }

  /** À appeler par les écrans de vente qui veulent réagir aux mises à jour de stock. */
  listen(): void {
    this.connect();
  }

  ngOnDestroy(): void {
    this.echo?.disconnect();
  }
}
