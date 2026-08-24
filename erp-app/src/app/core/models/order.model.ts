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
  /** false pour une ligne composant issue de l'éclatement d'un menu (voir
   *  App\Support\MenuResolver côté API) — son prix est déjà porté par la ligne "porteuse" du menu
   *  (product_id = le menu lui-même, priced=true) ; à exclure du total (voir order-builder.ts::lineTotal),
   *  sinon le menu serait facturé en plus de la somme de ses composants. `true` pour toute ligne
   *  normale ou de combo (comportement inchangé). */
  priced: boolean;
  product_id: number;
  menu_id: number | null;
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
  /** D'où vient la commande — voir Readme.md et ticket-print.util.ts::sourceLabel (même
   *  vocabulaire que Ticket.source). Nullable : les commandes créées avant cette colonne n'ont
   *  pas de valeur fiable à afficher. */
  source: string | null;
  /** Boutique en ligne uniquement (erp_public_shop, voir App\Support\ShopSaleRecorder côté API)
   *  — absent/null pour toutes les autres sources. */
  fulfillment_type?: 'pickup' | 'delivery' | null;
  delivery_address?: string | null;
  /** Coordonnées client collectées par Stripe Checkout — boutique en ligne uniquement, comme
   *  fulfillment_type/delivery_address ci-dessus. */
  customer_name?: string | null;
  customer_phone?: string | null;
  /** Cycle de vie dédié aux commandes à livrer (voir OrderController::updateDeliveryStatus côté
   *  API) — ces commandes ne passent jamais par le Kitchen Display, ce statut remplace le suivi
   *  poste/passe habituel (order_sections.state). Null pour toute autre commande. */
  delivery_status?: 'pending' | 'out_for_delivery' | 'delivered' | null;
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
  /** Points fidélité utilisés en réduction (voir App\Support\LoyaltyPoints) — revalidé côté serveur, comme discount_code. */
  points_redeemed?: number | null;
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
