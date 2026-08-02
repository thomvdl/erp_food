import { Product } from './product.model';
import { User } from './user.model';
import { TableElement } from './floor-plan.model';

export interface Client {
  id: number;
  firstname: string;
  lastname: string;
  email: string | null;
  phone: string | null;
}

export interface PaymentMethod {
  id: number;
  name: string;
  slug: string;
}

export interface TicketLine {
  id: number;
  quantity: number;
  note: string | null;
  unit_price: number | string;
  product_id: number;
  product?: Product;
}

export interface TicketSection {
  id: number;
  name: string | null;
  lines: TicketLine[];
}

export interface TicketPayment {
  id: number;
  value: number | string;
  payment_method_id: number;
  payment_method?: PaymentMethod;
  /** Qui a encaissé ce paiement et dans quelle session de caisse — voir cash-session.model.ts. */
  user_id: number | null;
  cash_session_id: number | null;
  user?: User | null;
  ticket_id?: number;
  ticket?: { id: number };
}

export interface Ticket {
  id: number;
  paid_at: string;
  client_id: number | null;
  table_id?: number | null;
  client?: Client | null;
  table?: TableElement | null;
  sections: TicketSection[];
  payments: TicketPayment[];
}

export interface CreateTicketPayload {
  client_id: number | null;
  /** Session de caisse active du vendeur, si le module Caisse est utilisé (voir cash-session.service.ts) — optionnel, une vente reste possible sans. */
  cash_session_id?: number | null;
  lines: { product_id: number; quantity: number }[];
  payments: { payment_method_id: number; value: number }[];
}
