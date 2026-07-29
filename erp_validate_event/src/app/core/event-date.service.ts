import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { EventDate } from './models/event.model';

/**
 * Lecture seule — cette app ne fait que choisir une occurrence (event_date) puis valider des
 * places, jamais en créer/modifier/supprimer (ça reste le rôle de erp-app). `list()` sans
 * argument renvoie toutes les dates tous events confondus — ce kiosque n'a pas de notion
 * d'event "courant", juste "quelle occurrence contrôler à cette entrée".
 */
@Injectable({ providedIn: 'root' })
export class EventDateService {
  private readonly http = inject(HttpClient);

  list(): Observable<EventDate[]> {
    return this.http.get<EventDate[]>(`${API_URL}/event-dates`);
  }

  /** Charge la salle + ses tables (nécessaire pour le placement strict) — `list()` ne charge que la salle sans ses tables. */
  get(id: number): Observable<EventDate> {
    return this.http.get<EventDate>(`${API_URL}/event-dates/${id}`);
  }
}
