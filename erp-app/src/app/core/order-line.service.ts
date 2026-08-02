import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { OrderLine } from './models/order.model';

@Injectable({ providedIn: 'root' })
export class OrderLineService {
  private readonly http = inject(HttpClient);

  /** Incrémente côté backend si ce produit est déjà présent dans la section — pas de doublon. */
  add(orderSectionId: number, productId: number): Observable<OrderLine> {
    return this.http.post<OrderLine>(`${API_URL}/order-sections/${orderSectionId}/lines`, { product_id: productId });
  }

  updateQuantity(id: number, quantity: number): Observable<OrderLine> {
    return this.http.put<OrderLine>(`${API_URL}/order-lines/${id}`, { quantity });
  }

  updateNote(id: number, note: string | null): Observable<OrderLine> {
    return this.http.put<OrderLine>(`${API_URL}/order-lines/${id}`, { note });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${API_URL}/order-lines/${id}`);
  }
}
