import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { Passe } from './models/order.model';

@Injectable({ providedIn: 'root' })
export class PasseService {
  private readonly http = inject(HttpClient);

  list(): Observable<Passe[]> {
    return this.http.get<Passe[]>(`${API_URL}/passes`);
  }
}
