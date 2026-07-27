export interface ProductCategory {
  id: number;
  name: string;
  slug: string;
}

export interface ProductCatalog {
  id: number;
  name: string;
  slug: string;
  /** Sélection indépendante par contexte POS — un catalogue peut être actif pour l'un, l'autre, les deux ou aucun. */
  active_restaurant: boolean;
  active_direct_sale: boolean;
}
