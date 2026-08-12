export interface Station {
  id: number;
  name: string;
  slug: string;
  /** "C'est dans station qu'on doit pouvoir choisir dans quelle passe ça doit aller" (voir Readme.md). */
  passe_id: number | null;
  passe?: Passe | null;
  /** "Ne plus avoir la possibilité de supprimer... ajouter un champ active" (voir Readme.md). */
  active: boolean;
}

/** "Ça passe dans le bon passe" (voir Readme.md, kitchen display) — plusieurs stations peuvent partager un même passe (stations.passe_id). */
export interface Passe {
  id: number;
  name: string;
  slug: string;
  stations?: Station[];
  /** "Ne plus avoir la possibilité de supprimer... ajouter un champ active" (voir Readme.md). */
  active: boolean;
}

export interface Tax {
  id: number;
  slug: string;
  value: number | string;
  /** "Ne plus avoir la possibilité de supprimer... ajouter un champ active" (voir Readme.md). */
  active: boolean;
}

/** Liste globale et réutilisable entre tous les produits (ex. Oignon, Fromage) — voir
 *  ProductIngredient (product.model.ts) pour le rattachement (removable ou non) à un produit. */
export interface Ingredient {
  id: number;
  name: string;
  position: number;
  /** "Ne plus avoir la possibilité de supprimer... ajouter un champ active" (voir Readme.md). */
  active: boolean;
}

/** Réglage générique clé/valeur (ex. name: "open_at", value: "09:00"). */
export interface Param {
  id: number;
  name: string;
  value: string | null;
}
