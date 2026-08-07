import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { ClientDetail } from './models/client-detail.model';
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

  /** Même endpoint que get() (voir ClientController::show, un seul point d'entrée réutilisé pour
   *  l'édition ET la fiche 360°) — juste typé plus riche pour la page ClientDetail. */
  getDetail(id: number): Observable<ClientDetail> {
    return this.http.get<ClientDetail>(`${API_URL}/clients/${id}`);
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
