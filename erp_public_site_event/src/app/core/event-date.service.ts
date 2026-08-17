import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { EventDate } from './models/event.model';

@Injectable({ providedIn: 'root' })
export class EventDateService {
  private readonly http = inject(HttpClient);

  /** GET /public/event-dates — voir routes/api.php : même méthode que la version staff
   *  (EventDateController::index), exposée hors auth:sanctum pour ce site. */
  list(): Observable<EventDate[]> {
    return this.http.get<EventDate[]>(`${API_URL}/public/event-dates`);
  }
}
