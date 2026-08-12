import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
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
  readonly error = signal<string | null>(null);

  private draggedId: number | null = null;

  constructor() {
    this.refresh();
  }

  private refresh(): void {
    this.categoryService.list().subscribe((categories) => this.categories.set(categories));
  }

  onDragStart(event: DragEvent, category: ProductCategory): void {
    this.draggedId = category.id;
    event.dataTransfer?.setData('text/plain', String(category.id));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  /** Réordonne localement pendant le survol pour un aperçu en direct — la position n'est
   *  persistée qu'au lâcher (voir onDragEnd/persistOrder). */
  onDragOver(event: DragEvent, category: ProductCategory): void {
    event.preventDefault();

    if (this.draggedId === null || this.draggedId === category.id) {
      return;
    }

    const current = this.categories();
    const fromIndex = current.findIndex((c) => c.id === this.draggedId);
    const toIndex = current.findIndex((c) => c.id === category.id);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
      return;
    }

    const reordered = [...current];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    this.categories.set(reordered);
  }

  onDragEnd(): void {
    this.draggedId = null;
    this.persistOrder();
  }

  private persistOrder(): void {
    const updates = this.categories()
      .map((category, position) => ({ category, position }))
      .filter(({ category, position }) => category.position !== position)
      .map(({ category, position }) => this.categoryService.update(category.id, { name: category.name, position }));

    if (updates.length === 0) {
      return;
    }

    this.error.set(null);
    forkJoin(updates).subscribe({
      next: () => this.refresh(),
      error: () => {
        this.error.set("Impossible d'enregistrer le nouvel ordre.");
        this.refresh();
      },
    });
  }
}
