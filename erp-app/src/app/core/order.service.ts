import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { CorrectOrderPayload, OpenOrderPayload, Order, OrderLine, PayOrderPayload, TransferOrderPayload } from './models/order.model';
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

  /** "Quand une order est payée elle devient un ticket" (voir Readme.md) — la commande est supprimée côté backend, la table libérée. */
  pay(id: number, payload: PayOrderPayload): Observable<Ticket> {
    return this.http.post<Ticket>(`${API_URL}/orders/${id}/pay`, payload);
  }

  /** Déplace la commande vers une autre table (libre) — le client a changé de place. */
  transfer(id: number, payload: TransferOrderPayload): Observable<Order> {
    return this.http.post<Order>(`${API_URL}/orders/${id}/transfer`, payload);
  }

  /** "Corriger une commande si il y a un produit en trop" — voir OrderController::correction. */
  correction(id: number, payload: CorrectOrderPayload): Observable<OrderLine[]> {
    return this.http.post<OrderLine[]>(`${API_URL}/orders/${id}/corrections`, payload);
  }

  /** Gestion > Livraison uniquement — voir OrderController::updateDeliveryStatus. `delivered`
   *  supprime la commande côté backend (déjà payée via son Ticket, comme `pay` ci-dessus), donc
   *  cette réponse n'est alors pas un Order valide — voir delivery-list.ts::advanceStatus. */
  updateDeliveryStatus(id: number, status: 'pending' | 'out_for_delivery' | 'delivered'): Observable<Order | { deleted: true }> {
    return this.http.put<Order | { deleted: true }>(`${API_URL}/orders/${id}/delivery-status`, { status });
  }
}
