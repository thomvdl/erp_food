import { Room, TableElement } from './floor-plan.model';
import { Client } from './ticket.model';

/** Le "spectacle" générique (juste un nom) — chaque occurrence datée vit dans EventDate. */
export interface Event {
  id: number;
  name: string;
  slug: string;
  dates_count?: number;
}

export interface EventDate {
  id: number;
  date: string;
  start_hour: string;
  event_id: number;
  room_id: number | null;
  number_place_limit: number | null;
  event?: Event;
  room?: Room | null;
  /** Nombre de billets vendus (voir EventDateController::index, withCount('tickets')) — absent
   *  des réponses qui ne passent pas par index() (ex. EventDateController::show). */
  tickets_count?: number;
}

export interface EventTicket {
  id: number;
  event_date_id: number;
  client_id: number;
  table_id: number | null;
  validation_code: string;
  validated_at: string | null;
  event_date?: EventDate;
  client?: Client;
  table?: TableElement | null;
}

export interface CreateEventTicketPayload {
  event_date_id: number;
  client_id: number;
  send_email: boolean;
  quantity: number;
}

export interface ValidateEventTicketPayload {
  code: string;
  table_id?: number;
}
