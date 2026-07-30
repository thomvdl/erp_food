export interface ProductCategory {
  id: number;
  name: string;
  slug: string;
  /** "Ne plus avoir la possibilité de supprimer... ajouter un champ active" (voir Readme.md). */
  active: boolean;
}

export interface ProductCatalog {
  id: number;
  name: string;
  slug: string;
  /** "Ne plus avoir la possibilité de supprimer... ajouter un champ active" (voir Readme.md) — distinct de active_restaurant/active_direct_sale ci-dessous. */
  active: boolean;
  /** Sélection indépendante par contexte POS — un catalogue peut être actif pour l'un, l'autre, les deux ou aucun. */
  active_restaurant: boolean;
  active_direct_sale: boolean;
}
