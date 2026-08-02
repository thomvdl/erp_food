import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { SelfOrderContext, SelfOrderPayload, SelfOrderResponse } from './models/self-order.model';

/**
 * Consommé uniquement par la page Order (mode QR, publique) — voir SelfOrderController côté API.
 * Aucun de ces appels n'attache de Bearer token (le client ne s'authentifie jamais), même sans
 * token présent l'authInterceptor laisse passer la requête telle quelle.
 */
@Injectable({ providedIn: 'root' })
export class SelfOrderService {
  private readonly http = inject(HttpClient);

  getContext(qrToken: string): Observable<SelfOrderContext> {
    return this.http.get<SelfOrderContext>(`${API_URL}/self-order/${qrToken}`);
  }

  submit(qrToken: string, payload: SelfOrderPayload): Observable<SelfOrderResponse> {
    return this.http.post<SelfOrderResponse>(`${API_URL}/self-order/${qrToken}/lines`, payload);
  }
}
