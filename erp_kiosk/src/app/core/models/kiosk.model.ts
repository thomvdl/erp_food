export interface Tax {
  id: number;
  slug: string;
  value: number | string;
}

export interface ProductCategory {
  id: number;
  name: string;
  slug: string;
  active: boolean;
}

export interface ProductCatalog {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  active_restaurant: boolean;
  active_direct_sale: boolean;
  active_self_order: boolean;
  active_kiosk: boolean;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number | string;
  active: boolean;
  tax_id: number | null;
  product_category_id: number | null;
  category?: ProductCategory | null;
  catalogs?: ProductCatalog[];
  tax?: Tax | null;
}

export interface PaymentMethod {
  id: number;
  name: string;
  slug: string;
}

export interface CashSession {
  id: number;
  user_id: number;
  opening_amount: number | string;
  opened_at: string;
  closed_at: string | null;
}

export interface OpenCashSessionPayload {
  user_id: number;
  opening_amount: number;
}

export interface CreateKioskOrderPayload {
  client_id: number | null;
  cash_session_id: number | null;
  /** Code promo appliqué (voir DiscountCalculator côté API) — revalidé côté serveur. */
  discount_code?: string | null;
  lines: { product_id: number; quantity: number }[];
  payments: { payment_method_id: number; value: number }[];
}

export type DiscountType = 'percentage' | 'fixed_amount' | 'free_product';

export interface Discount {
  id: number;
  code: string;
  type: DiscountType;
  value: number | string | null;
  free_product_id: number | null;
}

/** Réponse de POST /discounts/validate — aperçu live avant paiement. */
export interface ValidateDiscountResponse {
  discount: Discount;
  amount_off: number;
}

export interface Client {
  id: number;
  firstname: string;
  lastname: string;
  email: string | null;
  phone: string | null;
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
}

export interface Ticket {
  id: number;
  paid_at: string;
  client_id: number | null;
  client?: Client | null;
  /** Toujours absent pour un ticket kiosque (pas de table, voir KioskOrderController) — le
   *  composant de reçu partagé (ticket-receipt) gère déjà son absence. */
  table?: null;
  sections: TicketSection[];
  payments: TicketPayment[];
  /** Réduction appliquée à ce ticket (voir DiscountCalculator) — null si aucune. */
  discount_id?: number | null;
  discount_amount?: number | string | null;
  discount?: Discount | null;
}
