import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { OpenOrderPayload, Order, PayOrderPayload } from './models/order.model';
import { Ticket } from './models/ticket.model';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);

  list(): Observable<Order[]> {
    return this.http.get<Order[]>(`${API_URL}/orders`);
  }

  get(id: number): Observable<Order> {
    return this.http.get<Order>(`${API_URL}/orders/${id}`);
  }

  open(payload: OpenOrderPayload): Observable<Order> {
    return this.http.post<Order>(`${API_URL}/orders`, payload);
  }

  cancel(id: number): Observable<void> {
    return this.http.delete<void>(`${API_URL}/orders/${id}`);
  }

  /** "Quand une order est payée elle devient un ticket" (voir Readme.md) — la commande est supprimée côté backend, la table libérée. */
  pay(id: number, payload: PayOrderPayload): Observable<Ticket> {
    return this.http.post<Ticket>(`${API_URL}/orders/${id}/pay`, payload);
  }
}
