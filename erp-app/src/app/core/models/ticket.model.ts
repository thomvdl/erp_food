import { Product } from './product.model';
import { User } from './user.model';
import { TableElement } from './floor-plan.model';
import { Discount } from './discount.model';
import { MenuChoice } from './menu-choice.model';

export interface Client {
  id: number;
  firstname: string;
  lastname: string;
  email: string | null;
  phone: string | null;
  /** Solde de points fidélité (voir App\Support\LoyaltyPoints côté API) — absent des payloads qui
   *  ne chargent pas le client complet (ex. la ligne d'un paiement déjà enregistré). */
  points_balance?: number;
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
  /** Recopié depuis OrderLine.is_correction au paiement (voir OrderController::pay) — voir
   *  ticket-print.util.ts::ticketLineTotal pour l'effet sur le total. */
  is_correction: boolean;
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

/** D'où vient le ticket — voir Readme.md. Nullable : les tickets créés avant cette colonne
 *  (migration add_source_to_orders_and_tickets_tables) n'ont pas de valeur fiable à afficher. */
export type TicketSource = 'pos_vente_directe' | 'pos_restaurant' | 'self_order' | 'kiosk';

export interface Ticket {
  id: number;
  paid_at: string;
  client_id: number | null;
  table_id?: number | null;
  source: TicketSource | null;
  client?: Client | null;
  table?: TableElement | null;
  sections: TicketSection[];
  payments: TicketPayment[];
  /** Réduction appliquée à ce ticket (voir DiscountCalculator) — null si aucune. */
  discount_id?: number | null;
  discount_amount?: number | string | null;
  discount?: Discount | null;
  /** Effet du programme de fidélité sur ce ticket (voir App\Support\LoyaltyPoints) — null si aucun client sélectionné/aucun point utilisé. */
  points_earned?: number | null;
  points_redeemed?: number | null;
  points_redeemed_amount?: number | string | null;
}

export interface CreateTicketPayload {
  client_id: number | null;
  /** Session de caisse active du vendeur, si le module Caisse est utilisé (voir cash-session.service.ts) — optionnel, une vente reste possible sans. */
  cash_session_id?: number | null;
  /** Code promo appliqué (voir DiscountCalculator) — revalidé côté serveur, jamais fait confiance au montant affiché côté client. */
  discount_code?: string | null;
  /** Points fidélité utilisés en réduction (voir App\Support\LoyaltyPoints) — revalidé côté serveur, comme discount_code. */
  points_redeemed?: number | null;
  /** menu_choices requis uniquement si le produit de la ligne est un menu (is_menu) — voir
   *  App\Support\MenuResolver côté API. */
  lines: { product_id: number; quantity: number; menu_choices?: MenuChoice[] }[];
  payments: { payment_method_id: number; value: number }[];
}
