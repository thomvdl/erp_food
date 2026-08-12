import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IngredientService } from '../../../../core/ingredient.service';
import { Ingredient } from '../../../../core/models/reference.model';

@Component({
  selector: 'app-ingredient-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './ingredient-list.html',
})
export class IngredientList {
  private readonly ingredientService = inject(IngredientService);

  readonly ingredients = signal<Ingredient[]>([]);

  constructor() {
    this.refresh();
  }

  private refresh(): void {
    this.ingredientService.list().subscribe((ingredients) => this.ingredients.set(ingredients));
  }
}
