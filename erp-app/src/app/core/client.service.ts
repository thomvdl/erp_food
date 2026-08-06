import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { Client } from './models/ticket.model';

/**
 * Double usage (voir ClientController) : sélecteur client du POS Vente directe (recherche libre
 * + création rapide) ET page Paramètres > Gestion des clients (CRUD complet).
 */
@Injectable({ providedIn: 'root' })
export class ClientService {
  private readonly http = inject(HttpClient);

  list(): Observable<Client[]> {
    return this.http.get<Client[]>(`${API_URL}/clients`);
  }

  get(id: number): Observable<Client> {
    return this.http.get<Client>(`${API_URL}/clients/${id}`);
  }

  search(query: string): Observable<Client[]> {
    return this.http.get<Client[]>(`${API_URL}/clients`, { params: { q: query } });
  }

  create(payload: Pick<Client, 'firstname' | 'lastname'> & Partial<Pick<Client, 'email' | 'phone'>>): Observable<Client> {
    return this.http.post<Client>(`${API_URL}/clients`, payload);
  }

  update(
    id: number,
    payload: Pick<Client, 'firstname' | 'lastname'> & Partial<Pick<Client, 'email' | 'phone'>>,
  ): Observable<Client> {
    return this.http.put<Client>(`${API_URL}/clients/${id}`, payload);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${API_URL}/clients/${id}`);
  }
}
