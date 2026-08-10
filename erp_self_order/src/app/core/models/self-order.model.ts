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
}

export interface SelfOrderPayload {
  number_of_guests?: number | null;
  lines: SelfOrderLinePayload[];
}

export interface SelfOrderResponse {
  order_id: number;
}
