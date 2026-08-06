import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { CreateTicketPayload, Ticket } from './models/ticket.model';

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly http = inject(HttpClient);

  list(limit?: number): Observable<Ticket[]> {
    return this.http.get<Ticket[]>(`${API_URL}/tickets`, {
      params: limit ? { limit } : {},
    });
  }

  get(id: number): Observable<Ticket> {
    return this.http.get<Ticket>(`${API_URL}/tickets/${id}`);
  }

  create(payload: CreateTicketPayload): Observable<Ticket> {
    return this.http.post<Ticket>(`${API_URL}/tickets`, payload);
  }

  /** Envoi (ou renvoi) du ticket par email au client — voir TicketController::sendEmail. */
  sendEmail(id: number): Observable<void> {
    return this.http.post<void>(`${API_URL}/tickets/${id}/send-email`, {});
  }
}
