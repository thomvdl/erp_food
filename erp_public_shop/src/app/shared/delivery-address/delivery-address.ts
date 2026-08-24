import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeliveryAddressService } from '../../core/delivery-address.service';
import { ShopService } from '../../core/shop.service';

/**
 * Badge topbar "adresse de livraison" — voir DeliveryAddressService (état partagé/persisté) et
 * App\Support\DeliveryZone côté API (vraie vérification, ce composant n'affiche qu'un aperçu).
 * Ajouté dans .shop-header de pages/catalog et pages/checkout (voir leurs templates) : composant
 * autonome plutôt que de faire transiter le rayon/l'état via chaque page parente, même principe
 * que shared/footer (récupère lui-même ce dont il a besoin).
 */
@Component({
  selector: 'app-delivery-address',
  imports: [FormsModule],
  templateUrl: './delivery-address.html',
  styleUrl: './delivery-address.css',
})
export class DeliveryAddress {
  private readonly shopService = inject(ShopService);
  readonly deliveryAddress = inject(DeliveryAddressService);

  readonly open = signal(false);
  readonly draft = signal('');
  readonly radiusKm = signal<number | null>(null);

  readonly label = computed(() => {
    const result = this.deliveryAddress.result();
    if (this.deliveryAddress.checking()) return 'Vérification…';
    if (!result) return 'Adresse de livraison';
    return result.within_radius ? `✓ Livrable (${result.distance_km} km)` : '✗ Hors zone';
  });

  constructor() {
    this.shopService.getCatalog().subscribe({ next: (catalog) => this.radiusKm.set(catalog.delivery_radius_km) });
  }

  toggle(): void {
    if (!this.open()) {
      this.draft.set(this.deliveryAddress.address());
    }
    this.open.set(!this.open());
  }

  close(): void {
    this.open.set(false);
  }

  submit(): void {
    this.deliveryAddress.check(this.draft());
  }
}
