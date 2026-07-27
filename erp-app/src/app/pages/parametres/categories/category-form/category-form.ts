import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProductCategoryService } from '../../../../core/product-category.service';

@Component({
  selector: 'app-category-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './category-form.html',
})
export class CategoryForm {
  private readonly categoryService = inject(ProductCategoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);

  readonly name = signal('');
  readonly error = signal<string | null>(null);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.categoryService.get(this.id).subscribe({
          next: (category) => this.name.set(category.name),
          error: () => this.error.set('Impossible de charger la catégorie.'),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);

    const payload = { name: this.name() };
    const request =
      this.isEdit() && this.id !== null
        ? this.categoryService.update(this.id, payload)
        : this.categoryService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/categories'),
      error: () => this.error.set("Impossible d'enregistrer la catégorie."),
    });
  }
}
