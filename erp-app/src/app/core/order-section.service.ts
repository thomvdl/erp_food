import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { OrderSection } from './models/order.model';

@Injectable({ providedIn: 'root' })
export class OrderSectionService {
  private readonly http = inject(HttpClient);

  /** name omis → le backend nomme automatiquement "Section N" (voir Readme.md). */
  create(orderId: number, name?: string): Observable<OrderSection> {
    return this.http.post<OrderSection>(`${API_URL}/orders/${orderId}/sections`, name ? { name } : {});
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${API_URL}/order-sections/${id}`);
  }

  /** "Valider" (voir Readme.md) — verrouille la section et l'envoie sur le kitchen display (en_attente -> send). */
  valider(id: number): Observable<OrderSection> {
    return this.http.post<OrderSection>(`${API_URL}/order-sections/${id}/valider`, {});
  }

  /** "Demander en cuisine" (voir Readme.md) — met la section en file d'attente active des postes (send -> ask). */
  demander(id: number): Observable<OrderSection> {
    return this.http.post<OrderSection>(`${API_URL}/order-sections/${id}/demander`, {});
  }
}
