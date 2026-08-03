import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { OrderStatusBoard } from './models/order-status.model';

/** Route publique (voir routes/api.php) — consommée par la page order-status. */
@Injectable({ providedIn: 'root' })
export class OrderStatusService {
  private readonly http = inject(HttpClient);

  get(): Observable<OrderStatusBoard> {
    return this.http.get<OrderStatusBoard>(`${API_URL}/kiosk-orders/status`);
  }
}
