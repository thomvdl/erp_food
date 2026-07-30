import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { Station } from './models/order.model';

@Injectable({ providedIn: 'root' })
export class StationService {
  private readonly http = inject(HttpClient);

  list(): Observable<Station[]> {
    return this.http.get<Station[]>(`${API_URL}/stations`);
  }
}
