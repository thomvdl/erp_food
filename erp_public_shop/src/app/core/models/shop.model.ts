export interface ShopCategory {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  image_url: string | null;
  /** Ordre d'affichage manuel (croissant) — voir ShopCatalogController::index côté API. */
  position: number;
}

/** Ingrédient d'un produit (voir Product.ingredients côté API) — `pivot.removable` détermine si
 *  le client peut le décocher au panier (ex. le pain reste coché, non décochable). */
export interface ShopProductIngredient {
  id: number;
  name: string;
  pivot: { removable: boolean };
}

/** Un produit éligible dans un groupe de choix de menu — juste de quoi l'afficher/l'identifier
 *  (voir ShopMenuGroup ci-dessous). `ingredients` uniquement renseigné pour permettre de
 *  personnaliser ("sans oignon") ce produit quand il est choisi À L'INTÉRIEUR d'un menu. */
export interface ShopMenuOption {
  id: number;
  name: string;
  price: number | string;
  ingredients?: ShopProductIngredient[];
}

/** Groupe de choix d'un menu (voir Product.menu_groups côté API) — le client choisit entre
 *  min_choices et max_choices produits parmi `options` avant d'ajouter le menu au panier. */
export interface ShopMenuGroup {
  id: number;
  label: string;
  min_choices: number;
  max_choices: number;
  options: ShopMenuOption[];
}

/** Note d'exclusion d'ingrédients pour UN produit choisi dans un groupe (voir
 *  ShopMenuChoice.product_notes) — texte libre, jamais validé côté serveur. */
export interface ShopMenuChoiceProductNote {
  product_id: number;
  note: string;
}

/** Ce que le client a choisi pour un groupe — envoyé dans ShopLinePayload.menu_choices, voir
 *  App\Support\MenuResolver côté API. */
export interface ShopMenuChoice {
  menu_group_id: number;
  product_ids: number[];
  product_notes?: ShopMenuChoiceProductNote[];
}

export interface ShopProduct {
  id: number;
  name: string;
  description: string | null;
  price: number | string;
  tax_id: number | null;
  product_category_id: number | null;
  category?: ShopCategory | null;
  /** Icône (emoji) choisie par l'admin — mutuellement exclusive avec image_url. */
  icon: string | null;
  image_url: string | null;
  /** Stock suivi pour ce produit — `null` = non suivi (disponibilité illimitée). Purement
   *  indicatif : le serveur reste la seule source de vérité à la validation du panier (voir
   *  ShopCheckoutController côté API). */
  stock_quantity: number | null;
  /** Un menu est un produit normal (même prix fixe, même panier) — is_menu sert uniquement à
   *  savoir qu'il faut ouvrir le sélecteur de choix avant de l'ajouter au panier. */
  is_menu?: boolean;
  menu_groups?: ShopMenuGroup[];
  ingredients?: ShopProductIngredient[];
}

export interface ShopCatalog {
  categories: ShopCategory[];
  products: ShopProduct[];
  /** Aperçu affiché côté checkout — le montant réellement facturé est toujours recalculé côté
   *  serveur à la soumission (voir ShopCheckoutController::store). */
  delivery_fee: number;
  /** Affiché dans le composant adresse de livraison (voir shared/delivery-address) — même valeur
   *  que celle réellement appliquée côté serveur (App\Support\DeliveryZone). */
  delivery_radius_km: number;
}

/** Résultat de vérification d'une adresse (voir ShopService::checkDeliveryAddress) — jamais la
 *  source de vérité finale, revalidé côté serveur à la soumission du panier. */
export interface DeliveryCheckResult {
  lat: number;
  lng: number;
  formatted_address: string;
  distance_km: number;
  within_radius: boolean;
}

export type FulfillmentType = 'pickup' | 'delivery';

export interface ShopLinePayload {
  product_id: number;
  quantity: number;
  note?: string | null;
  /** Requis uniquement si le produit est un menu (is_menu) — voir App\Support\MenuResolver côté API. */
  menu_choices?: ShopMenuChoice[];
}

export interface ShopCheckoutPayload {
  fulfillment_type: FulfillmentType;
  customer_email?: string | null;
  /** Résout un Client existant côté serveur (jamais de client_id brut envoyé par le front) — voir
   *  CustomerSessionService, ShopCheckoutController::store. */
  customer_phone?: string | null;
  /** Requise si fulfillment_type === 'delivery' — voir DeliveryAddressService, revalidée côté
   *  serveur (App\Support\DeliveryZone) avant d'accepter la commande. */
  delivery_address?: string | null;
  /** Revalidé côté serveur (App\Support\DiscountCalculator) — jamais de montant envoyé par le
   *  client, juste le code. */
  discount_code?: string | null;
  /** Revalidé côté serveur (App\Support\LoyaltyPoints) — jamais de montant envoyé par le client,
   *  juste le nombre de points. */
  points_redeemed?: number | null;
  lines: ShopLinePayload[];
}

export interface ShopCheckoutResponse {
  id: number;
  checkout_url: string;
}

export interface ShopCheckoutStatus {
  status: 'pending' | 'paid' | 'failed' | 'expired';
  fulfillment_type: FulfillmentType;
  total: number | string;
  delivery_fee: number | string | null;
  delivery_address: string | null;
  discount_amount: number | string | null;
  points_earned: number | null;
  points_redeemed_amount: number | string | null;
  lines: Array<{ product_id: number; product_name: string | null; quantity: number; unit_price: number; note: string | null; priced: boolean }>;
}
