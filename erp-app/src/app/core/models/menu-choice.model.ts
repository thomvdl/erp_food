/** Note d'exclusion d'ingrédients pour UN produit choisi dans un groupe (voir MenuChoice.product_notes
 *  ci-dessous) — texte libre ("Sans oignon"), jamais validé contre la vraie liste d'ingrédients
 *  côté API, comme n'importe quelle autre note (voir App\Support\MenuResolver::resolve). */
export interface MenuChoiceProductNote {
  product_id: number;
  note: string;
}

/** Ce que le client a choisi pour un groupe d'un menu, envoyé au moment de l'ajout au panier/à
 *  la commande — voir App\Support\MenuResolver côté API (validé contre menu_groups/min_choices/
 *  max_choices). */
export interface MenuChoice {
  menu_group_id: number;
  product_ids: number[];
  /** Personnalisation d'ingrédients par produit choisi (voir Product.ingredients côté option de
   *  groupe) — absent/vide si aucun produit choisi de ce groupe n'a d'ingrédient retiré. */
  product_notes?: MenuChoiceProductNote[];
}
