import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_URL } from './api-config';
import { AuthUser, LoginResponse } from './models/auth.model';

const TOKEN_KEY = 'erp-v2-auth-token';

/**
 * "Mettre en place l'authentification pour app et validate event" (voir Readme.md). Token
 * Sanctum (Bearer), pas de cookie de session — chaque app front (erp-app, erp_validate_event)
 * gère le sien indépendamment, persisté en localStorage pour survivre à un rechargement.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly currentUser = signal<AuthUser | null>(null);

  loginWithPassword(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${API_URL}/auth/login`, { username, password }).pipe(tap((res) => this.setSession(res)));
  }

  loginWithBarcode(barcode: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${API_URL}/auth/login`, { barcode }).pipe(tap((res) => this.setSession(res)));
  }

  fetchMe(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${API_URL}/auth/me`).pipe(tap((user) => this.currentUser.set(user)));
  }

  /** La session locale est effacée que l'appel réussisse ou non (token déjà expiré, hors
   *  ligne...) — l'intention de l'utilisateur ("me déconnecter") ne doit pas dépendre du réseau. */
  logout(): Observable<void> {
    return this.http.post<void>(`${API_URL}/auth/logout`, {}).pipe(
      tap({
        next: () => this.clearSession(),
        error: () => this.clearSession(),
      }),
    );
  }

  /** Utilisé aussi par l'intercepteur sur un 401 en cours de session (token expiré/révoqué côté
   *  serveur) — pas la peine d'attendre une réponse de logout() qui échouerait de toute façon. */
  clearSession(): void {
    this.token.set(null);
    this.currentUser.set(null);
    localStorage.removeItem(TOKEN_KEY);
  }

  private setSession(res: LoginResponse): void {
    this.token.set(res.token);
    this.currentUser.set(res.user);
    localStorage.setItem(TOKEN_KEY, res.token);
  }
}
