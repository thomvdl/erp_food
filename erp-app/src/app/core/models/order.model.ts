import { Client } from './ticket.model';
import { Product } from './product.model';
import { Room, TableElement } from './floor-plan.model';

export interface OrderLine {
  id: number;
  quantity: number;
  note: string | null;
  /** Ligne de correction (voir OrderController::correction) : `quantity` reste positive en base,
   *  ce flag inverse son effet sur le total ("mettre le produit avec le montant en négatif") —
   *  voir order-builder.ts::lineTotal. Créée quand un produit a été rentré en trop après l'envoi
   *  d'une section en cuisine (plus modifiable normalement, voir OrderLineController::assertEditable). */
  is_correction: boolean;
  product_id: number;
  order_section_id: number;
  product?: Product;
}

export interface OrderSection {
  id: number;
  name: string | null;
  order_id: number;
  /** Cycle kitchen display (voir Readme.md) : en_attente -> send (valider) -> ask (demander en cuisine) -> do (fait) -> seed (envoyer). */
  state: 'en_attente' | 'send' | 'ask' | 'do' | 'seed' | 'done';
  lines: OrderLine[];
}

export interface Order {
  id: number;
  state: string;
  client_id: number | null;
  table_id: number | null;
  /** Uniquement pour les commandes kiosque (voir KioskOrderController côté API) — le numéro du
   *  Ticket déjà encaissé, affiché à la place de la table dans Gestion des commandes. */
  ticket_id: number | null;
  number_of_guests: number | null;
  client?: Client | null;
  table?: (TableElement & { room?: Room }) | null;
  sections: OrderSection[];
}

export interface OpenOrderPayload {
  table_id: number;
  number_of_guests: number;
}

export interface PayOrderPayload {
  client_id: number | null;
  cash_session_id?: number | null;
  /** Code promo appliqué (voir DiscountCalculator) — revalidé côté serveur. */
  discount_code?: string | null;
  payments: { payment_method_id: number; value: number }[];
}

export interface TransferOrderPayload {
  table_id: number;
}

/** "Corriger une commande si il y a un produit en trop" — voir OrderController::correction.
 *  `quantity` est le nombre d'unités à corriger, en positif (le serveur crée la ligne négative
 *  en effet, jamais en base). Refusé (422) si la commande ne comporte pas toutes ses sections
 *  envoyées, ou si la quantité demandée dépasse ce qui a réellement été commandé. */
export interface CorrectOrderPayload {
  lines: { product_id: number; quantity: number }[];
}
