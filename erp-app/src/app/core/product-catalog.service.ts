import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { CachedResourceService } from './cached-resource.service';
import { API_URL } from './api-config';
import { ProductCatalog } from './models/catalog.model';

@Injectable({ providedIn: 'root' })
export class ProductCatalogService extends CachedResourceService<ProductCatalog> {
  protected readonly endpoint = 'product-catalogs';

  /** Rend ce catalogue actif pour le POS Restaurant (voir ProductCatalogController@activateForRestaurant)
   *  — invalide le cache puisque tous les autres catalogues viennent de repasser à
   *  `active_restaurant: false` côté serveur. Indépendant de activateForDirectSale. */
  activateForRestaurant(id: number): Observable<ProductCatalog> {
    return this.http
      .post<ProductCatalog>(`${API_URL}/product-catalogs/${id}/activate-restaurant`, {})
      .pipe(tap(() => this.invalidate()));
  }

  /** Même principe pour le POS Vente directe. */
  activateForDirectSale(id: number): Observable<ProductCatalog> {
    return this.http
      .post<ProductCatalog>(`${API_URL}/product-catalogs/${id}/activate-direct-sale`, {})
      .pipe(tap(() => this.invalidate()));
  }
}
