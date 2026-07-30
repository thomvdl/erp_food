import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { Order } from './models/order.model';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);

  /** Toutes les commandes ouvertes (voir kitchen-board.ts pour le filtrage sur state/poste). */
  list(): Observable<Order[]> {
    return this.http.get<Order[]>(`${API_URL}/orders`);
  }
}
