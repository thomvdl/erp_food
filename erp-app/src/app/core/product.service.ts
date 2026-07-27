import { Injectable } from '@angular/core';
import { CachedResourceService } from './cached-resource.service';
import { Product } from './models/product.model';

@Injectable({ providedIn: 'root' })
export class ProductService extends CachedResourceService<Product> {
  protected readonly endpoint = 'products';
}
