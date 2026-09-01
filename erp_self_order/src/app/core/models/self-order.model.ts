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

/** Ingrédient d'un produit (voir Product.ingredients côté API) — `pivot.removable` détermine si
 *  le client peut le décocher au panier (ex. le pain reste coché, non décochable). */
export interface SelfOrderProductIngredient {
  id: number;
  name: string;
  pivot: { removable: boolean };
}

/** Un produit éligible dans un groupe de choix de menu — juste de quoi l'afficher/l'identifier
 *  (voir SelfOrderMenuGroup ci-dessous). `ingredients` uniquement renseigné pour permettre de
 *  personnaliser ("sans oignon") ce produit quand il est choisi À L'INTÉRIEUR d'un menu (voir
 *  ProductController::WITH menuGroups.options.ingredients côté API). */
export interface SelfOrderMenuOption {
  id: number;
  name: string;
  price: number | string;
  ingredients?: SelfOrderProductIngredient[];
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

/** Note d'exclusion d'ingrédients pour UN produit choisi dans un groupe (voir
 *  SelfOrderMenuChoice.product_notes) — texte libre, jamais validé côté serveur. */
export interface SelfOrderMenuChoiceProductNote {
  product_id: number;
  note: string;
}

/** Ce que le client a choisi pour un groupe — envoyé dans SelfOrderLinePayload.menu_choices, voir
 *  App\Support\MenuResolver côté API. */
export interface SelfOrderMenuChoice {
  menu_group_id: number;
  product_ids: number[];
  /** Personnalisation d'ingrédients par produit choisi (voir SelfOrderMenuOption.ingredients) —
   *  absent/vide si aucun produit choisi de ce groupe n'a d'ingrédient retiré. */
  product_notes?: SelfOrderMenuChoiceProductNote[];
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
  /** Ingrédients de ce produit, retirables ou non au panier — voir la modale de personnalisation. */
  ingredients?: SelfOrderProductIngredient[];
}

/** Slide du carrousel hero affiché entre la topbar et les catégories (voir order.ts) — même
 *  bannières que erp_kiosk (Paramètres > Bannières kiosque côté erp-app, KioskBannerController). */
export interface SelfOrderBanner {
  id: number;
  title: string | null;
  subtitle: string | null;
  position: number;
  active: boolean;
  image_url: string | null;
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
  /** Absent quand closed === true, même raison que products ci-dessus. */
  banners?: SelfOrderBanner[];
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
