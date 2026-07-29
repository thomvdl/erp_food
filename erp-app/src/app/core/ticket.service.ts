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

  create(payload: CreateTicketPayload): Observable<Ticket> {
    return this.http.post<Ticket>(`${API_URL}/tickets`, payload);
  }
}
