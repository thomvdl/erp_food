import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { TableElement } from './models/floor-plan.model';

/**
 * Pas un ResourceService : la création est imbriquée sous une room
 * (`/rooms/{room}/tables`) mais mise à jour est shallow (`/tables/{table}`) —
 * ne correspond pas à la forme mono-endpoint du ResourceService générique
 * (même raison que RoomElementService dans ERP/). Pas de suppression : voir
 * TableElementController côté API, désactivation (`active`) à la place.
 */
@Injectable({ providedIn: 'root' })
export class TableElementService {
  private readonly http = inject(HttpClient);

  create(roomId: number, payload: Partial<TableElement>): Observable<TableElement> {
    return this.http.post<TableElement>(`${API_URL}/rooms/${roomId}/tables`, payload);
  }

  update(tableId: number, payload: Partial<TableElement>): Observable<TableElement> {
    return this.http.put<TableElement>(`${API_URL}/tables/${tableId}`, payload);
  }

  /** PNG du QR self-order de cette table (voir SelfOrderController::qr — route publique, comme
   *  users/{user}/qr, mais on passe quand même par HttpClient pour rester cohérent avec le reste
   *  du service plutôt qu'un fetch() nu). */
  getQrBlob(tableId: number): Observable<Blob> {
    return this.http.get(`${API_URL}/tables/${tableId}/qr`, { responseType: 'blob' });
  }
}
