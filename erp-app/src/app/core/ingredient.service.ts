import { Injectable } from '@angular/core';
import { CachedResourceService } from './cached-resource.service';
import { Ingredient } from './models/reference.model';

@Injectable({ providedIn: 'root' })
export class IngredientService extends CachedResourceService<Ingredient> {
  protected readonly endpoint = 'ingredients';
}
