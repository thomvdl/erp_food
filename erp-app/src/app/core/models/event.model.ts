import { Room, TableElement } from './floor-plan.model';
import { Client } from './ticket.model';

/** Le "spectacle" générique (juste un nom) — chaque occurrence datée vit dans EventDate. */
export interface Event {
  id: number;
  name: string;
  slug: string;
  image_url: string | null;
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

/** Liste globale et réutilisable entre tous les events (ex. Adulte/Étudiant/Senior) — voir
 *  EventTicketPrice pour le prix, propre à chaque event. */
export interface EventTicketType {
  id: number;
  name: string;
  position: number;
  active: boolean;
}

/** Tarif d'un type de place POUR un event donné (voir GET/PUT events/{event}/ticket-prices) —
 *  `price` null = ce type n'est pas proposé pour cet event, même s'il existe globalement. */
export interface EventTicketPrice {
  event_ticket_type_id: number;
  name: string;
  price: number | string | null;
}

export interface EventTicket {
  id: number;
  event_date_id: number;
  client_id: number;
  table_id: number | null;
  event_ticket_type_id: number | null;
  /** Instantané du tarif au moment de la vente (voir EventTicketController::store) — reste
   *  correct même si l'event change ses prix plus tard. */
  price: number | string | null;
  validation_code: string;
  validated_at: string | null;
  /** Ligne de ticket créée à l'encaissement (voir EventTicketController::pay) — null tant que la
   *  place n'est pas encore payée. */
  ticket_line_id: number | null;
  event_date?: EventDate;
  client?: Client;
  table?: TableElement | null;
  ticket_type?: EventTicketType | null;
}

export interface CreateEventTicketPayload {
  event_date_id: number;
  client_id: number;
  event_ticket_type_id: number;
  send_email: boolean;
  quantity: number;
}

export interface ValidateEventTicketPayload {
  code: string;
  table_id?: number;
}

/** Encaissement d'une ou plusieurs places déjà vendues (voir EventTicketController::pay) —
 *  modale dédiée dans EventDashboard. `amount` normalement absent (toujours resommé depuis
 *  EventTicket::price côté serveur) — requis seulement si une des places n'a pas de prix connu
 *  (vendue avant l'ajout des types/tarifs), auquel cas le vendeur choisit le montant total. */
export interface PayEventTicketsPayload {
  event_ticket_ids: number[];
  payment_method_id: number;
  cash_session_id?: number | null;
  amount?: number | null;
}
