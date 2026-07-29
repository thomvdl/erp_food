import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { EventDate } from './models/event.model';

/**
 * Pas un ResourceService générique : la création est imbriquée sous un event
 * (`/events/{event}/dates`, comme `TableElementService` sous une room), lecture/mise à
 * jour/suppression shallow, et `list()` accepte un `event_id` optionnel (toutes les dates
 * tous events confondus si absent — utilisé par `erp_validate_event`).
 */
@Injectable({ providedIn: 'root' })
export class EventDateService {
  private readonly http = inject(HttpClient);

  list(eventId?: number): Observable<EventDate[]> {
    return this.http.get<EventDate[]>(`${API_URL}/event-dates`, {
      params: eventId ? { event_id: eventId } : {},
    });
  }

  get(id: number): Observable<EventDate> {
    return this.http.get<EventDate>(`${API_URL}/event-dates/${id}`);
  }

  create(eventId: number, payload: Partial<EventDate>): Observable<EventDate> {
    return this.http.post<EventDate>(`${API_URL}/events/${eventId}/dates`, payload);
  }

  update(id: number, payload: Partial<EventDate>): Observable<EventDate> {
    return this.http.put<EventDate>(`${API_URL}/event-dates/${id}`, payload);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${API_URL}/event-dates/${id}`);
  }
}
