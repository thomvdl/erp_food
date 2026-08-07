import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProductService } from '../../../core/product.service';
import { ProductCatalogService } from '../../../core/product-catalog.service';
import { ProductCategoryService } from '../../../core/product-category.service';
import { ProductStockEchoService } from '../../../core/product-stock-echo.service';
import { Product } from '../../../core/models/product.model';
import { ProductCatalog, ProductCategory } from '../../../core/models/catalog.model';

type SortField = 'name' | 'category' | 'catalogs' | 'station' | 'price' | 'stock' | 'active';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './product-list.html',
})
export class ProductList {
  private readonly productService = inject(ProductService);
  private readonly catalogService = inject(ProductCatalogService);
  private readonly categoryService = inject(ProductCategoryService);
  private readonly productStockEcho = inject(ProductStockEchoService);

  readonly products = signal<Product[]>([]);
  readonly catalogs = signal<ProductCatalog[]>([]);
  readonly categories = signal<ProductCategory[]>([]);

  readonly nameFilter = signal('');
  readonly catalogFilterId = signal<number | null>(null);
  readonly categoryFilterId = signal<number | null>(null);
  readonly sortField = signal<SortField>('name');
  readonly sortDir = signal<SortDir>('asc');

  readonly filteredProducts = computed(() => {
    const name = this.nameFilter().trim().toLowerCase();
    const catalogId = this.catalogFilterId();
    const categoryId = this.categoryFilterId();
    const field = this.sortField();
    const dir = this.sortDir() === 'asc' ? 1 : -1;

    const filtered = this.products().filter((product) => {
      const matchesName = !name || product.name.toLowerCase().includes(name);
      const matchesCatalog = catalogId === null || (product.catalogs ?? []).some((catalog) => catalog.id === catalogId);
      const matchesCategory = categoryId === null || product.category?.id === categoryId;
      return matchesName && matchesCatalog && matchesCategory;
    });

    return [...filtered].sort((a, b) => this.compare(a, b, field) * dir);
  });

  constructor() {
    this.refresh();
    this.catalogService.list().subscribe((catalogs) => this.catalogs.set(catalogs));
    this.categoryService.list().subscribe((categories) => this.categories.set(categories));

    // Voir App\Events\ProductStockUpdated — la colonne Stock se met à jour en direct à chaque
    // vente ou réapprovisionnement ailleurs dans l'ERP, sans recharger la page.
    this.productStockEcho.listen();
    this.productStockEcho.stockUpdated.pipe(takeUntilDestroyed()).subscribe(({ productId, stockQuantity }) => {
      this.products.set(
        this.products().map((product) => (product.id === productId ? { ...product, stock_quantity: stockQuantity } : product)),
      );
    });
  }

  formatPrice(product: Product): string {
    return Number(product.price).toFixed(2) + ' €';
  }

  catalogNames(product: Product): string {
    return (product.catalogs ?? []).map((catalog) => catalog.name).join(', ') || '—';
  }

  toggleSort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDir.set('asc');
    }
  }

  sortIndicator(field: SortField): string {
    if (this.sortField() !== field) {
      return '';
    }
    return this.sortDir() === 'asc' ? '▲' : '▼';
  }

  remove(product: Product): void {
    if (!confirm(`Supprimer le produit "${product.name}" ?`)) {
      return;
    }

    this.productService.remove(product.id).subscribe(() => this.refresh());
  }

  private compare(a: Product, b: Product, field: SortField): number {
    switch (field) {
      case 'price':
        return Number(a.price) - Number(b.price);
      case 'stock':
        // null (illimité) trié comme "infini" — toujours après n'importe quel stock fini en tri
        // ascendant, cohérent avec l'idée qu'un stock illimité n'est jamais "le plus bas".
        return (a.stock_quantity ?? Infinity) - (b.stock_quantity ?? Infinity);
      case 'category':
        return (a.category?.name ?? '').localeCompare(b.category?.name ?? '');
      case 'catalogs':
        return this.catalogNames(a).localeCompare(this.catalogNames(b));
      case 'station':
        return (a.station?.name ?? '').localeCompare(b.station?.name ?? '');
      case 'active':
        return Number(a.active) - Number(b.active);
      default:
        return a.name.localeCompare(b.name);
    }
  }

  private refresh(): void {
    this.productService.list().subscribe((products) => this.products.set(products));
  }
}
