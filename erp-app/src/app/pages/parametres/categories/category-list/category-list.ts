import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductCategoryService } from '../../../../core/product-category.service';
import { ProductCategory } from '../../../../core/models/catalog.model';

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './category-list.html',
})
export class CategoryList {
  private readonly categoryService = inject(ProductCategoryService);

  readonly categories = signal<ProductCategory[]>([]);

  constructor() {
    this.refresh();
  }

  private refresh(): void {
    this.categoryService.list().subscribe((categories) => this.categories.set(categories));
  }
}
