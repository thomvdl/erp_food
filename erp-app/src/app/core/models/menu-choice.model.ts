/** Ce que le client a choisi pour un groupe d'un menu, envoyé au moment de l'ajout au panier/à
 *  la commande — voir App\Support\MenuResolver côté API (validé contre menu_groups/min_choices/
 *  max_choices). */
export interface MenuChoice {
  menu_group_id: number;
  product_ids: number[];
}
