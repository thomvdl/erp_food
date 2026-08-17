import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { Company } from './models/booking.model';

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly http = inject(HttpClient);

  /** GET /company rendue publique pour ce site (voir routes/api.php) — coordonnées non
   *  sensibles, déjà exposées telles quelles dans le pied des emails clients. */
  get(): Observable<Company> {
    return this.http.get<Company>(`${API_URL}/company`);
  }
}
