import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { Client } from './models/ticket.model';

/**
 * Pas de CRUD complet côté API pour l'instant (voir ClientController) — juste ce qu'il faut
 * pour le sélecteur client du POS Vente directe : recherche libre + création rapide.
 */
@Injectable({ providedIn: 'root' })
export class ClientService {
  private readonly http = inject(HttpClient);

  search(query: string): Observable<Client[]> {
    return this.http.get<Client[]>(`${API_URL}/clients`, { params: { q: query } });
  }

  create(payload: Pick<Client, 'firstname' | 'lastname'> & Partial<Pick<Client, 'email' | 'phone'>>): Observable<Client> {
    return this.http.post<Client>(`${API_URL}/clients`, payload);
  }
}
