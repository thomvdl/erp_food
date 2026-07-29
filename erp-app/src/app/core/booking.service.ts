import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { Booking, BookingPayload } from './models/booking.model';

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly http = inject(HttpClient);

  list(date?: string): Observable<Booking[]> {
    return this.http.get<Booking[]>(`${API_URL}/bookings`, {
      params: date ? { date } : {},
    });
  }

  get(id: number): Observable<Booking> {
    return this.http.get<Booking>(`${API_URL}/bookings/${id}`);
  }

  create(payload: BookingPayload): Observable<Booking> {
    return this.http.post<Booking>(`${API_URL}/bookings`, payload);
  }

  update(id: number, payload: BookingPayload): Observable<Booking> {
    return this.http.put<Booking>(`${API_URL}/bookings/${id}`, payload);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${API_URL}/bookings/${id}`);
  }

  validate(id: number): Observable<Booking> {
    return this.http.post<Booking>(`${API_URL}/bookings/${id}/validate`, {});
  }
}
