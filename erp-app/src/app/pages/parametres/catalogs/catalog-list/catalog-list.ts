import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductCatalogService } from '../../../../core/product-catalog.service';
import { ProductCatalog } from '../../../../core/models/catalog.model';

@Component({
  selector: 'app-catalog-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './catalog-list.html',
})
export class CatalogList {
  private readonly catalogService = inject(ProductCatalogService);

  readonly catalogs = signal<ProductCatalog[]>([]);
  readonly activating = signal<number | null>(null);

  constructor() {
    this.refresh();
  }

  activateForRestaurant(catalog: ProductCatalog): void {
    if (catalog.active_restaurant || this.activating() !== null) {
      return;
    }

    this.activating.set(catalog.id);
    this.catalogService.activateForRestaurant(catalog.id).subscribe({
      next: () => {
        this.activating.set(null);
        this.refresh();
      },
      error: () => this.activating.set(null),
    });
  }

  activateForDirectSale(catalog: ProductCatalog): void {
    if (catalog.active_direct_sale || this.activating() !== null) {
      return;
    }

    this.activating.set(catalog.id);
    this.catalogService.activateForDirectSale(catalog.id).subscribe({
      next: () => {
        this.activating.set(null);
        this.refresh();
      },
      error: () => this.activating.set(null),
    });
  }

  activateForKiosk(catalog: ProductCatalog): void {
    if (catalog.active_kiosk || this.activating() !== null) {
      return;
    }

    this.activating.set(catalog.id);
    this.catalogService.activateForKiosk(catalog.id).subscribe({
      next: () => {
        this.activating.set(null);
        this.refresh();
      },
      error: () => this.activating.set(null),
    });
  }

  activateForSelfOrder(catalog: ProductCatalog): void {
    if (catalog.active_self_order || this.activating() !== null) {
      return;
    }

    this.activating.set(catalog.id);
    this.catalogService.activateForSelfOrder(catalog.id).subscribe({
      next: () => {
        this.activating.set(null);
        this.refresh();
      },
      error: () => this.activating.set(null),
    });
  }

  private refresh(): void {
    this.catalogService.list().subscribe((catalogs) => this.catalogs.set(catalogs));
  }
}
