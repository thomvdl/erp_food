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
  readonly active = signal(true);
  readonly error = signal<string | null>(null);

  /** Voir product-form.ts — même pattern (icône = champ JSON normal, image = endpoint séparé,
   *  disponible seulement en édition). */
  readonly icon = signal('');
  readonly imageUrl = signal<string | null>(null);
  readonly uploadingImage = signal(false);
  readonly imageError = signal<string | null>(null);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.categoryService.get(this.id).subscribe({
          next: (category) => {
            this.name.set(category.name);
            this.active.set(category.active);
            this.icon.set(category.icon ?? '');
            this.imageUrl.set(category.image_url);
          },
          error: () => this.error.set('Impossible de charger la catégorie.'),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);

    const payload = { name: this.name(), active: this.active(), icon: this.icon().trim() || null };
    const request =
      this.isEdit() && this.id !== null
        ? this.categoryService.update(this.id, payload)
        : this.categoryService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/categories'),
      error: () => this.error.set("Impossible d'enregistrer la catégorie."),
    });
  }

  /** Voir product-form.ts::onImageSelected — même logique. */
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.id === null) {
      return;
    }

    this.uploadingImage.set(true);
    this.imageError.set(null);

    this.categoryService.uploadImage(this.id, file).subscribe({
      next: (category) => {
        this.uploadingImage.set(false);
        this.imageUrl.set(category.image_url);
        this.icon.set(category.icon ?? '');
        input.value = '';
      },
      error: () => {
        this.uploadingImage.set(false);
        this.imageError.set("Impossible d'envoyer l'image.");
        input.value = '';
      },
    });
  }

  removeImage(): void {
    if (this.id === null) {
      return;
    }

    this.uploadingImage.set(true);
    this.imageError.set(null);

    this.categoryService.removeImage(this.id).subscribe({
      next: (category) => {
        this.uploadingImage.set(false);
        this.imageUrl.set(category.image_url);
      },
      error: () => {
        this.uploadingImage.set(false);
        this.imageError.set("Impossible de supprimer l'image.");
      },
    });
  }
}
