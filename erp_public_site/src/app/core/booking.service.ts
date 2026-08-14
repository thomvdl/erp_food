import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { Booking, CreateBookingPayload } from './models/booking.model';

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly http = inject(HttpClient);

  /** Route publique dédiée (pas /bookings, réservée au staff authentifié) — voir
   *  PublicBookingController côté API : crée le Client si besoin, laisse la réservation
   *  "En attente" (validated_at null) jusqu'à confirmation par le staff. */
  create(payload: CreateBookingPayload): Observable<Booking> {
    return this.http.post<Booking>(`${API_URL}/public/bookings`, payload);
  }
}
