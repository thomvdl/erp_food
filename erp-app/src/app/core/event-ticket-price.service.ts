import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { EventTicketPrice } from './models/event.model';

/**
 * Pas un ResourceService : toujours scopé à un event (`events/{event}/ticket-prices`), pas de
 * vue globale ni de create/get/remove — juste lire/remplacer l'ensemble des tarifs d'un event
 * (voir EventTicketPriceController côté API).
 */
@Injectable({ providedIn: 'root' })
export class EventTicketPriceService {
  private readonly http = inject(HttpClient);

  list(eventId: number): Observable<EventTicketPrice[]> {
    return this.http.get<EventTicketPrice[]>(`${API_URL}/events/${eventId}/ticket-prices`);
  }

  update(eventId: number, prices: { event_ticket_type_id: number; price: number | null }[]): Observable<EventTicketPrice[]> {
    return this.http.put<EventTicketPrice[]>(`${API_URL}/events/${eventId}/ticket-prices`, { prices });
  }
}
