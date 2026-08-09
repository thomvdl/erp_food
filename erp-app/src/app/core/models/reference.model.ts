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

/** Réglage générique clé/valeur (ex. name: "open_at", value: "09:00"). */
export interface Param {
  id: number;
  name: string;
  value: string | null;
}
