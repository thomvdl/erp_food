import { Injectable } from '@angular/core';
import { CachedResourceService } from './cached-resource.service';
import { ProductCategory } from './models/catalog.model';

@Injectable({ providedIn: 'root' })
export class ProductCategoryService extends CachedResourceService<ProductCategory> {
  protected readonly endpoint = 'product-categories';
}
