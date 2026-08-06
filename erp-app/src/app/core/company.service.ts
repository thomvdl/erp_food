import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { API_URL } from './api-config';
import { Company } from './models/company.model';

/** Coordonnées de l'établissement (voir CompanyController) — mêmes pour toute la session,
 *  mises en cache (shareReplay) pour ne pas refaire l'appel à chaque affichage d'un ticket. */
@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly http = inject(HttpClient);
  private cache$: Observable<Company> | null = null;

  get(): Observable<Company> {
    if (!this.cache$) {
      this.cache$ = this.http.get<Company>(`${API_URL}/company`).pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }

    return this.cache$;
  }
}
