import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { DeliveryCheckResult, ShopCatalog, ShopCheckoutPayload, ShopCheckoutResponse, ShopCheckoutStatus } from './models/shop.model';

/**
 * Consommé par les pages catalogue/checkout/confirmation — voir ShopCatalogController/
 * ShopCheckoutController côté API. Cette app n'a aucun mécanisme d'authentification : tous les
 * appels partent sans en-tête Authorization, même principe que erp_self_order.
 */
@Injectable({ providedIn: 'root' })
export class ShopService {
  private readonly http = inject(HttpClient);

  getCatalog(): Observable<ShopCatalog> {
    return this.http.get<ShopCatalog>(`${API_URL}/shop/catalog`);
  }

  checkout(payload: ShopCheckoutPayload): Observable<ShopCheckoutResponse> {
    return this.http.post<ShopCheckoutResponse>(`${API_URL}/shop/checkout`, payload);
  }

  getCheckoutStatus(id: number): Observable<ShopCheckoutStatus> {
    return this.http.get<ShopCheckoutStatus>(`${API_URL}/shop/checkouts/${id}`);
  }

  /** Vérification "à chaud" depuis la topbar (voir DeliveryAddressService) — jamais la source de
   *  vérité, revalidée côté serveur à la soumission du panier (ShopCheckoutController::store). */
  checkDeliveryAddress(address: string): Observable<DeliveryCheckResult> {
    return this.http.post<DeliveryCheckResult>(`${API_URL}/shop/delivery-check`, { address });
  }

  /** Bouton "Simuler le paiement" (pages/checkout, dev/test uniquement) — voir
   *  ShopCheckoutController::simulate côté API, qui renvoie 404 hors dev/test. */
  simulatePayment(id: number): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${API_URL}/shop/checkouts/${id}/simulate`, {});
  }
}
