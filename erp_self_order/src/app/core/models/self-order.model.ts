export interface SelfOrderTax {
  id: number;
  slug: string;
  value: number | string;
}

export interface SelfOrderCategory {
  id: number;
  name: string;
  slug: string;
  /** Déjà renvoyés par l'API (ProductCategory::$appends côté modèle, voir icon/image_url sur
   *  SelfOrderProduct) — juste absents du typage jusqu'ici, utilisés par l'accueil en tuiles. */
  icon: string | null;
  image_url: string | null;
  /** Ordre d'affichage manuel (croissant) — voir ProductCategoryController::index côté API. */
  position: number;
}

/** Un produit éligible dans un groupe de choix de menu — juste de quoi l'afficher/l'identifier
 *  (voir SelfOrderMenuGroup ci-dessous). */
export interface SelfOrderMenuOption {
  id: number;
  name: string;
  price: number | string;
}

/** Groupe de choix d'un menu (voir Product.menu_groups côté API) — le client choisit entre
 *  min_choices et max_choices produits parmi `options` avant d'ajouter le menu au panier. */
export interface SelfOrderMenuGroup {
  id: number;
  label: string;
  min_choices: number;
  max_choices: number;
  options: SelfOrderMenuOption[];
}

/** Ce que le client a choisi pour un groupe — envoyé dans SelfOrderLinePayload.menu_choices, voir
 *  App\Support\MenuResolver côté API. */
export interface SelfOrderMenuChoice {
  menu_group_id: number;
  product_ids: number[];
}

export interface SelfOrderProduct {
  id: number;
  name: string;
  description: string | null;
  price: number | string;
  tax_id: number | null;
  product_category_id: number | null;
  tax?: SelfOrderTax | null;
  category?: SelfOrderCategory | null;
  /** Icône (emoji) choisie par l'admin — mutuellement exclusive avec image_url (voir
   *  App\Support\ImageUpload côté API). Repli si les deux sont absents : voir productEmoji() dans order.ts. */
  icon: string | null;
  image_url: string | null;
  /** Stock suivi pour ce produit — `null` = non suivi (disponibilité illimitée). Décrémenté côté
   *  serveur à chaque vente (voir App\Support\StockManager) ; le staff qui encaisse reste la
   *  seule source de vérité (voir OrderController::pay), cette valeur n'est qu'indicative ici. */
  stock_quantity: number | null;
  /** Un menu est un produit normal (même prix fixe, même panier) — is_menu sert uniquement à
   *  savoir qu'il faut ouvrir le sélecteur de choix avant de l'ajouter au panier (voir
   *  menu_groups, order.ts::openMenuModal). */
  is_menu?: boolean;
  menu_groups?: SelfOrderMenuGroup[];
}

export interface SelfOrderContext {
  table: { label: string; room_name: string | null };
  /** Voir App\Support\OpeningHours côté API — absent des anciennes réponses en cache, donc
   *  toujours vérifié avec `=== true` côté front (voir order.ts). */
  closed?: boolean;
  /** Message à afficher au client quand closed === true (horaires d'ouverture, etc.). */
  message?: string;
  /** Absent quand closed === true (le catalogue n'est délibérément pas chargé, voir SelfOrderController::show). */
  products?: SelfOrderProduct[];
}

export interface SelfOrderLinePayload {
  product_id: number;
  quantity: number;
  note?: string | null;
  /** Requis uniquement si le produit est un menu (is_menu) — voir App\Support\MenuResolver côté API. */
  menu_choices?: SelfOrderMenuChoice[];
}

export interface SelfOrderPayload {
  number_of_guests?: number | null;
  lines: SelfOrderLinePayload[];
}

export interface SelfOrderResponse {
  order_id: number;
}
