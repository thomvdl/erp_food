import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_URL } from './api-config';

/**
 * Plain CRUD over HTTP, no caching — always fetches fresh data.
 * Prefer CachedResourceService unless a resource is expected to change
 * from outside the current session while the app is open.
 */
export abstract class ResourceService<T extends { id: number }> {
  protected readonly http = inject(HttpClient);
  protected abstract readonly endpoint: string;

  list(): Observable<T[]> {
    return this.http.get<T[]>(`${API_URL}/${this.endpoint}`);
  }

  get(id: number): Observable<T> {
    return this.http.get<T>(`${API_URL}/${this.endpoint}/${id}`);
  }

  create(payload: Partial<T>): Observable<T> {
    return this.http.post<T>(`${API_URL}/${this.endpoint}`, payload).pipe(tap(() => this.invalidate()));
  }

  update(id: number, payload: Partial<T>): Observable<T> {
    return this.http.put<T>(`${API_URL}/${this.endpoint}/${id}`, payload).pipe(tap(() => this.invalidate()));
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${API_URL}/${this.endpoint}/${id}`).pipe(tap(() => this.invalidate()));
  }

  /** No-op here; overridden by CachedResourceService to clear its cache. */
  protected invalidate(): void {}
}
