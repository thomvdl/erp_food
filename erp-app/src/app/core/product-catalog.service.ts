import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { CachedResourceService } from './cached-resource.service';
import { API_URL } from './api-config';
import { ProductCatalog } from './models/catalog.model';

@Injectable({ providedIn: 'root' })
export class ProductCatalogService extends CachedResourceService<ProductCatalog> {
  protected readonly endpoint = 'product-catalogs';

  /** Bascule ce catalogue actif/inactif pour le POS Restaurant (voir
   *  ProductCatalogController@setActiveForRestaurant) — plusieurs catalogues peuvent être actifs
   *  à la fois pour ce contexte, indépendant de setActiveForDirectSale. */
  setActiveForRestaurant(id: number, active: boolean): Observable<ProductCatalog> {
    return this.http
      .put<ProductCatalog>(`${API_URL}/product-catalogs/${id}/active-restaurant`, { active })
      .pipe(tap(() => this.invalidate()));
  }

  /** Même principe pour le POS Vente directe. */
  setActiveForDirectSale(id: number, active: boolean): Observable<ProductCatalog> {
    return this.http
      .put<ProductCatalog>(`${API_URL}/product-catalogs/${id}/active-direct-sale`, { active })
      .pipe(tap(() => this.invalidate()));
  }

  /** Même principe pour erp_kiosk (voir ProductCatalogController@setActiveForKiosk) — indépendant
   *  du catalogue self_order/QR. */
  setActiveForKiosk(id: number, active: boolean): Observable<ProductCatalog> {
    return this.http
      .put<ProductCatalog>(`${API_URL}/product-catalogs/${id}/active-kiosk`, { active })
      .pipe(tap(() => this.invalidate()));
  }

  /** Même principe pour erp_self_order (mode QR — voir ProductCatalogController@setActiveForSelfOrder),
   *  indépendant du catalogue kiosque. */
  setActiveForSelfOrder(id: number, active: boolean): Observable<ProductCatalog> {
    return this.http
      .put<ProductCatalog>(`${API_URL}/product-catalogs/${id}/active-self-order`, { active })
      .pipe(tap(() => this.invalidate()));
  }

  /** Même principe pour erp_public_shop (voir ProductCatalogController@setActiveForPublicShop),
   *  indépendant des autres canaux de vente. */
  setActiveForPublicShop(id: number, active: boolean): Observable<ProductCatalog> {
    return this.http
      .put<ProductCatalog>(`${API_URL}/product-catalogs/${id}/active-public-shop`, { active })
      .pipe(tap(() => this.invalidate()));
  }
}
