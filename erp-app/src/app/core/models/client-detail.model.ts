import { Booking } from './booking.model';
import { EventTicket } from './event.model';
import { Client, Ticket } from './ticket.model';

/** Une ligne d'historique de points (voir App\Support\LoyaltyPoints côté API) — points signé : positif = gagné, négatif = utilisé. */
export interface ClientPointMovement {
  id: number;
  points: number;
  ticket_id: number | null;
  created_at: string;
}

/** Réponse de GET /clients/:id vue depuis la fiche 360° (ClientController::show) — même endpoint
 *  que celui utilisé par ClientForm (édition), qui n'en lit qu'un sous-ensemble via `Client`. */
export interface ClientDetail extends Client {
  points_balance: number;
  tickets: Ticket[];
  bookings: Booking[];
  event_tickets: EventTicket[];
  point_movements: ClientPointMovement[];
}
