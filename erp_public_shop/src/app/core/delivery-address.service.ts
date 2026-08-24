import { Injectable, inject, signal } from '@angular/core';
import { ShopService } from './shop.service';
import { DeliveryCheckResult } from './models/shop.model';

const STORAGE_KEY = 'erp_public_shop.delivery_address';

/**
 * État partagé entre le badge topbar (voir shared/delivery-address) et pages/checkout — même
 * principe que CartService (signal + persistance localStorage) : l'adresse saisie/validée doit
 * survivre à la navigation catalogue -> checkout sans repasser par un état global type NgRx.
 * `result` n'est qu'un aperçu (voir ShopService::checkDeliveryAddress) : le vrai contrôle a
 * toujours lieu côté serveur à la soumission du panier (App\Support\DeliveryZone).
 */
@Injectable({ providedIn: 'root' })
export class DeliveryAddressService {
  private readonly shopService = inject(ShopService);

  readonly address = signal(this.restoreAddress());
  readonly result = signal<DeliveryCheckResult | null>(this.restoreResult());
  readonly checking = signal(false);
  readonly error = signal<string | null>(null);

  check(address: string): void {
    const trimmed = address.trim();
    if (!trimmed || this.checking()) return;

    this.checking.set(true);
    this.error.set(null);

    this.shopService.checkDeliveryAddress(trimmed).subscribe({
      next: (result) => {
        this.checking.set(false);
        this.address.set(trimmed);
        this.result.set(result);
        this.persist(trimmed, result);
      },
      error: (err) => {
        this.checking.set(false);
        this.result.set(null);
        this.persist(trimmed, null);
        this.error.set(err.error?.errors?.delivery_address?.[0] ?? err.error?.message ?? "Impossible de vérifier cette adresse.");
      },
    });
  }

  clear(): void {
    this.address.set('');
    this.result.set(null);
    this.error.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Stockage indisponible — sans conséquence, l'état en mémoire reste correct pour la session.
    }
  }

  private persist(address: string, result: DeliveryCheckResult | null): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ address, result }));
    } catch {
      // Voir clear() — même tolérance.
    }
  }

  private restoreAddress(): string {
    return this.restore()?.address ?? '';
  }

  private restoreResult(): DeliveryCheckResult | null {
    return this.restore()?.result ?? null;
  }

  private restore(): { address: string; result: DeliveryCheckResult | null } | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
