import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { CreateEventTicketPayload, EventTicket, ValidateEventTicketPayload } from './models/event.model';

/**
 * Pas un ResourceService : toujours filtré par occurrence (event_date), pas de vue globale, et
 * l'action `validate` n'a pas d'équivalent générique — voir EventTicketController côté API.
 */
@Injectable({ providedIn: 'root' })
export class EventTicketService {
  private readonly http = inject(HttpClient);

  listForEventDate(eventDateId: number): Observable<EventTicket[]> {
    return this.http.get<EventTicket[]>(`${API_URL}/event-tickets`, { params: { event_date_id: eventDateId } });
  }

  /** Répond toujours un tableau — un élément par place créée (voir quantity côté payload). */
  create(payload: CreateEventTicketPayload): Observable<EventTicket[]> {
    return this.http.post<EventTicket[]>(`${API_URL}/event-tickets`, payload);
  }

  update(id: number, clientId: number): Observable<EventTicket> {
    return this.http.put<EventTicket>(`${API_URL}/event-tickets/${id}`, { client_id: clientId });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${API_URL}/event-tickets/${id}`);
  }

  validate(payload: ValidateEventTicketPayload): Observable<EventTicket> {
    return this.http.post<EventTicket>(`${API_URL}/event-tickets/validate`, payload);
  }
}
