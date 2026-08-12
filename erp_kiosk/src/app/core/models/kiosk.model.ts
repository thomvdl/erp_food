export interface Tax {
  id: number;
  slug: string;
  value: number | string;
}

export interface ProductCategory {
  id: number;
  name: string;
  slug: string;
  /** Ordre d'affichage manuel (croissant) — voir ProductCategoryController::index côté API. */
  position: number;
  active: boolean;
  /** Icône (emoji) choisie par l'admin — mutuellement exclusive avec image_url (voir
   *  App\Support\ImageUpload côté API). Repli si les deux sont absents : voir categoryEmoji() dans kiosk-order.ts. */
  icon: string | null;
  image_url: string | null;
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

/** Ingrédient d'un produit (voir Product.ingredients côté API) — `pivot.removable` détermine si
 *  le client peut le décocher au panier (ex. le pain reste coché, non décochable). */
export interface ProductIngredient {
  id: number;
  name: string;
  pivot: { removable: boolean };
}

/** Un produit éligible dans un groupe de choix de menu — juste de quoi l'afficher/l'identifier.
 *  `ingredients` uniquement renseigné pour permettre de personnaliser ("sans oignon") ce produit
 *  quand il est choisi À L'INTÉRIEUR d'un menu (voir ProductController::WITH
 *  menuGroups.options.ingredients côté API). */
export interface MenuOption {
  id: number;
  name: string;
  price: number | string;
  ingredients?: ProductIngredient[];
}

/** Groupe de choix d'un menu (voir Product.menu_groups côté API) — le staff/client choisit entre
 *  min_choices et max_choices produits parmi `options` avant d'ajouter le menu au panier. */
export interface MenuGroup {
  id: number;
  label: string;
  min_choices: number;
  max_choices: number;
  options: MenuOption[];
}

/** Note d'exclusion d'ingrédients pour UN produit choisi dans un groupe (voir
 *  MenuChoice.product_notes) — texte libre, jamais validé côté serveur. */
export interface MenuChoiceProductNote {
  product_id: number;
  note: string;
}

/** Ce qui a été choisi pour un groupe — envoyé dans CreateKioskOrderPayload.lines[].menu_choices,
 *  voir App\Support\MenuResolver côté API. */
export interface MenuChoice {
  menu_group_id: number;
  product_ids: number[];
  /** Personnalisation d'ingrédients par produit choisi (voir MenuOption.ingredients) — absent/vide
   *  si aucun produit choisi de ce groupe n'a d'ingrédient retiré. */
  product_notes?: MenuChoiceProductNote[];
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
  /** Stock suivi pour ce produit — `null` = non suivi (disponibilité illimitée). Décrémenté côté
   *  serveur à chaque vente (voir App\Support\StockManager), le serveur reste la seule source de
   *  vérité au paiement. */
  stock_quantity: number | null;
  /** Voir ProductCategory.icon ci-dessus — même principe. Repli : voir productEmoji() dans kiosk-order.ts. */
  icon: string | null;
  image_url: string | null;
  /** Un menu est un produit normal (même prix fixe, même panier) — is_menu sert uniquement à
   *  savoir qu'il faut ouvrir le sélecteur de choix avant de l'ajouter au panier. */
  is_menu?: boolean;
  menu_groups?: MenuGroup[];
  /** Ingrédients de ce produit, retirables ou non au panier — voir la modale de personnalisation. */
  ingredients?: ProductIngredient[];
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
  /** Points fidélité utilisés en réduction (voir App\Support\LoyaltyPoints côté API) — revalidé côté serveur, comme discount_code. */
  points_redeemed?: number | null;
  /** menu_choices requis uniquement si le produit de la ligne est un menu (is_menu) — voir
   *  App\Support\MenuResolver côté API. */
  /** note : résumé des ingrédients retirés (ex. "Sans oignon", voir Product.ingredients/modale de
   *  personnalisation) — jamais validée contre la vraie liste côté serveur, texte libre. */
  lines: { product_id: number; quantity: number; note?: string | null; menu_choices?: MenuChoice[] }[];
  payments: { payment_method_id: number; value: number }[];
}

/** Même forme que CreateKioskOrderPayload sans `payments` — le variant QR est Bancontact only,
 *  pas de choix de moyen de paiement (voir KioskCheckoutController côté API). */
export type CreateKioskCheckoutPayload = Omit<CreateKioskOrderPayload, 'payments'>;

/** Réponse de POST /kiosk-checkouts (KioskCheckoutController::store) — `qr` est un PNG encodé en
 *  data URI, directement affichable dans un <img>, pas d'appel réseau séparé à authentifier. */
export interface KioskCheckout {
  id: number;
  qr: string;
  expires_at: string;
}

export type KioskCheckoutStatus = 'pending' | 'paid' | 'failed' | 'expired';

/** Réponse de GET /kiosk-checkouts/:id (KioskCheckoutController::show) — utilisée à la fois par le
 *  polling de secours et par le handler de l'event temps réel checkout.paid/checkout.failed (voir
 *  kiosk-payment-echo.service.ts), un seul endpoint pour les deux. */
export interface KioskCheckoutState {
  status: KioskCheckoutStatus;
  ticket: Ticket | null;
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
  /** Solde de points fidélité (voir App\Support\LoyaltyPoints côté API). */
  points_balance?: number;
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
