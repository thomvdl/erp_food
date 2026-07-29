import { Client } from './ticket.model';

export type BookingType = 'breakfast' | 'lunch' | 'dinner';

export interface Booking {
  id: number;
  client_id: number;
  number_of_guests: number;
  type: BookingType;
  date: string;
  hour: string;
  validated_at: string | null;
  client?: Client;
}

export interface BookingPayload {
  client_id: number;
  number_of_guests: number;
  type: BookingType;
  date: string;
  hour: string;
}
