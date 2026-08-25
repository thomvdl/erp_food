import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { ClientAddress } from './models/client-address.model';

/** Voir ShopCustomerAddressController côté API — `phone`/`email` identifient le client sur chaque
 *  appel (même modèle de confiance que CustomerService, pas de vrai token de session). */
@Injectable({ providedIn: 'root' })
export class ClientAddressService {
  private readonly http = inject(HttpClient);

  list(phone: string | null, email: string | null): Observable<ClientAddress[]> {
    return this.http.post<ClientAddress[]>(`${API_URL}/shop/customer/addresses/list`, { phone, email });
  }

  create(phone: string | null, email: string | null, label: string | null, address: string): Observable<ClientAddress> {
    return this.http.post<ClientAddress>(`${API_URL}/shop/customer/addresses`, { phone, email, label, address });
  }

  update(id: number, phone: string | null, email: string | null, label: string | null, address: string | null): Observable<ClientAddress> {
    return this.http.put<ClientAddress>(`${API_URL}/shop/customer/addresses/${id}`, { phone, email, label, address });
  }

  setDefault(id: number, phone: string | null, email: string | null): Observable<ClientAddress> {
    return this.http.post<ClientAddress>(`${API_URL}/shop/customer/addresses/${id}/default`, { phone, email });
  }

  remove(id: number, phone: string | null, email: string | null): Observable<{ deleted: true }> {
    return this.http.delete<{ deleted: true }>(`${API_URL}/shop/customer/addresses/${id}`, { body: { phone, email } });
  }
}
