import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { CreateEventTicketPayload, EventTicket, PayEventTicketsPayload, ValidateEventTicketPayload } from './models/event.model';

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

  /** `event_ticket_type_id` optionnel : absent/inchangé = pas touché, voir
   *  EventTicketController::update (recalcule le prix si le type change, refuse sur une place
   *  déjà payée). */
  update(id: number, payload: { client_id: number; event_ticket_type_id?: number | null }): Observable<EventTicket> {
    return this.http.put<EventTicket>(`${API_URL}/event-tickets/${id}`, payload);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${API_URL}/event-tickets/${id}`);
  }

  validate(payload: ValidateEventTicketPayload): Observable<EventTicket> {
    return this.http.post<EventTicket>(`${API_URL}/event-tickets/validate`, payload);
  }

  /** Répond les places payées, à jour (voir EventTicket.ticket_line_id) — voir
   *  EventTicketController::pay. */
  pay(payload: PayEventTicketsPayload): Observable<EventTicket[]> {
    return this.http.post<EventTicket[]>(`${API_URL}/event-tickets/pay`, payload);
  }
}
