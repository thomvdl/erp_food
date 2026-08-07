import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { ReportPeriod, ReportSummary } from './models/report.model';

/** Voir ReportController::summary côté API — pas de mise en cache (CachedResourceService) : les
 *  chiffres doivent rester frais à chaque changement de période, pas de risque de resservir une
 *  période déjà consultée depuis une autre session. */
@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);

  summary(period: ReportPeriod): Observable<ReportSummary> {
    return this.http.get<ReportSummary>(`${API_URL}/reports/summary`, { params: { period } });
  }
}
