import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { Company } from './models/company.model';

/** GET /company rendue publique côté API (voir routes/api.php, CompanyController) — coordonnées
 *  non sensibles, déjà exposées telles quelles dans le pied des emails clients et de
 *  erp_public_site_event, dont ce service reprend le principe. */
@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly http = inject(HttpClient);

  get(): Observable<Company> {
    return this.http.get<Company>(`${API_URL}/company`);
  }
}
