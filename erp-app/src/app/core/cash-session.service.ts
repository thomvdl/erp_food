import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_URL } from './api-config';
import { CashSession, CloseCashSessionPayload, OpenCashSessionPayload } from './models/cash-session.model';

@Injectable({ providedIn: 'root' })
export class CashSessionService {
  private readonly http = inject(HttpClient);

  list(userId?: number): Observable<CashSession[]> {
    return this.http.get<CashSession[]>(`${API_URL}/cash-sessions`, {
      params: userId ? { user_id: userId } : {},
    });
  }

  /** Le backend renvoie {} (pas null) quand il n'y a pas de session ouverte — voir CONTEXT.md
   *  (comportement de Laravel/Symfony sur response()->json(null)). Normalisé ici en null. */
  active(userId: number): Observable<CashSession | null> {
    return this.http
      .get<CashSession | Record<string, never>>(`${API_URL}/cash-sessions/active`, { params: { user_id: userId } })
      .pipe(map((session) => ('id' in session ? (session as CashSession) : null)));
  }

  get(id: number): Observable<CashSession> {
    return this.http.get<CashSession>(`${API_URL}/cash-sessions/${id}`);
  }

  open(payload: OpenCashSessionPayload): Observable<CashSession> {
    return this.http.post<CashSession>(`${API_URL}/cash-sessions`, payload);
  }

  close(id: number, payload: CloseCashSessionPayload): Observable<CashSession> {
    return this.http.post<CashSession>(`${API_URL}/cash-sessions/${id}/close`, payload);
  }
}
