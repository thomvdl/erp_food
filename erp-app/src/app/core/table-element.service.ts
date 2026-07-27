import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { TableElement } from './models/floor-plan.model';

/**
 * Pas un ResourceService : la création est imbriquée sous une room
 * (`/rooms/{room}/tables`) mais lecture/mise à jour/suppression sont shallow
 * (`/tables/{table}`) — ne correspond pas à la forme mono-endpoint du
 * ResourceService générique (même raison que RoomElementService dans ERP/).
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

  remove(tableId: number): Observable<void> {
    return this.http.delete<void>(`${API_URL}/tables/${tableId}`);
  }
}
