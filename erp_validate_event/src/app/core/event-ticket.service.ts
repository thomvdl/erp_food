import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { EventTicket, ValidateEventTicketPayload } from './models/event.model';

@Injectable({ providedIn: 'root' })
export class EventTicketService {
  private readonly http = inject(HttpClient);

  /** Sert uniquement à colorer le plan de salle (places prises/libres) — pas de vue globale. */
  listForEventDate(eventDateId: number): Observable<EventTicket[]> {
    return this.http.get<EventTicket[]>(`${API_URL}/event-tickets`, { params: { event_date_id: eventDateId } });
  }

  validate(payload: ValidateEventTicketPayload): Observable<EventTicket> {
    return this.http.post<EventTicket>(`${API_URL}/event-tickets/validate`, payload);
  }

  /** Étape 2 du placement strict : le ticket doit déjà être validé (voir event-checkin). */
  assignTable(ticketId: number, tableId: number): Observable<EventTicket> {
    return this.http.post<EventTicket>(`${API_URL}/event-tickets/${ticketId}/assign-table`, { table_id: tableId });
  }
}
