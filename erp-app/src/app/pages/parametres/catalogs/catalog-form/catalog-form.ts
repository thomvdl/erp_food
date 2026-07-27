import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProductCatalogService } from '../../../../core/product-catalog.service';

@Component({
  selector: 'app-catalog-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './catalog-form.html',
})
export class CatalogForm {
  private readonly catalogService = inject(ProductCatalogService);
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
        this.catalogService.get(this.id).subscribe({
          next: (catalog) => this.name.set(catalog.name),
          error: () => this.error.set('Impossible de charger le catalogue.'),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);

    const payload = { name: this.name() };
    const request =
      this.isEdit() && this.id !== null
        ? this.catalogService.update(this.id, payload)
        : this.catalogService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/catalogues'),
      error: () => this.error.set("Impossible d'enregistrer le catalogue."),
    });
  }
}
