import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IngredientService } from '../../../../core/ingredient.service';

@Component({
  selector: 'app-ingredient-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './ingredient-form.html',
})
export class IngredientForm {
  private readonly ingredientService = inject(IngredientService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);

  readonly name = signal('');
  readonly active = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.ingredientService.get(this.id).subscribe({
          next: (ingredient) => {
            this.name.set(ingredient.name);
            this.active.set(ingredient.active);
          },
          error: () => this.error.set("Impossible de charger l'ingrédient."),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);

    const payload = { name: this.name(), active: this.active() };
    const request =
      this.isEdit() && this.id !== null ? this.ingredientService.update(this.id, payload) : this.ingredientService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/ingredients'),
      error: () => this.error.set("Impossible d'enregistrer l'ingrédient."),
    });
  }
}
