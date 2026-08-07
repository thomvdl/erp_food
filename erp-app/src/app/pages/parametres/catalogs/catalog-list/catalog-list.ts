import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProductCatalogService } from '../../../../core/product-catalog.service';
import { ProductCatalog } from '../../../../core/models/catalog.model';

type StatusFilter = 'all' | 'active' | 'inactive';

@Component({
  selector: 'app-catalog-list',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './catalog-list.html',
})
export class CatalogList {
  private readonly catalogService = inject(ProductCatalogService);

  readonly catalogs = signal<ProductCatalog[]>([]);
  /** Id du catalogue dont une case vient d'être basculée — désactive juste cette ligne le temps de
   *  la requête, contrairement à l'ancien comportement qui bloquait tout le tableau (n'a plus de
   *  sens : les cases sont maintenant indépendantes, plusieurs bascules simultanées sont valides). */
  readonly togglingId = signal<number | null>(null);

  readonly nameFilter = signal('');
  /** Porte sur `catalog.active` (le statut global du catalogue), pas sur les 4 cases par
   *  contexte — même principe que product-list.ts::catalogFilterId, un filtre indépendant. */
  readonly statusFilter = signal<StatusFilter>('all');

  readonly filteredCatalogs = computed(() => {
    const name = this.nameFilter().trim().toLowerCase();
    const status = this.statusFilter();

    return this.catalogs().filter((catalog) => {
      const matchesName = !name || catalog.name.toLowerCase().includes(name);
      const matchesStatus = status === 'all' || (status === 'active' ? catalog.active : !catalog.active);
      return matchesName && matchesStatus;
    });
  });

  constructor() {
    this.refresh();
  }

  toggleRestaurant(catalog: ProductCatalog, active: boolean): void {
    this.togglingId.set(catalog.id);
    this.catalogService.setActiveForRestaurant(catalog.id, active).subscribe({
      next: () => {
        this.togglingId.set(null);
        this.refresh();
      },
      error: () => this.togglingId.set(null),
    });
  }

  toggleDirectSale(catalog: ProductCatalog, active: boolean): void {
    this.togglingId.set(catalog.id);
    this.catalogService.setActiveForDirectSale(catalog.id, active).subscribe({
      next: () => {
        this.togglingId.set(null);
        this.refresh();
      },
      error: () => this.togglingId.set(null),
    });
  }

  toggleKiosk(catalog: ProductCatalog, active: boolean): void {
    this.togglingId.set(catalog.id);
    this.catalogService.setActiveForKiosk(catalog.id, active).subscribe({
      next: () => {
        this.togglingId.set(null);
        this.refresh();
      },
      error: () => this.togglingId.set(null),
    });
  }

  toggleSelfOrder(catalog: ProductCatalog, active: boolean): void {
    this.togglingId.set(catalog.id);
    this.catalogService.setActiveForSelfOrder(catalog.id, active).subscribe({
      next: () => {
        this.togglingId.set(null);
        this.refresh();
      },
      error: () => this.togglingId.set(null),
    });
  }

  private refresh(): void {
    this.catalogService.list().subscribe((catalogs) => this.catalogs.set(catalogs));
  }
}
