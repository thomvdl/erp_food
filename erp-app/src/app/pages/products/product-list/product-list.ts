import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductService } from '../../../core/product.service';
import { Product } from '../../../core/models/product.model';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './product-list.html',
})
export class ProductList {
  private readonly productService = inject(ProductService);

  readonly products = signal<Product[]>([]);

  constructor() {
    this.refresh();
  }

  formatPrice(product: Product): string {
    return Number(product.price).toFixed(2) + ' €';
  }

  catalogNames(product: Product): string {
    return (product.catalogs ?? []).map((catalog) => catalog.name).join(', ') || '—';
  }

  remove(product: Product): void {
    if (!confirm(`Supprimer le produit "${product.name}" ?`)) {
      return;
    }

    this.productService.remove(product.id).subscribe(() => this.refresh());
  }

  private refresh(): void {
    this.productService.list().subscribe((products) => this.products.set(products));
  }
}
