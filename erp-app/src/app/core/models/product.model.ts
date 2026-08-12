import { ProductCatalog, ProductCategory } from './catalog.model';
import { Station, Tax } from './reference.model';

/** Un produit qui compose un combo (voir Product.components) — `pivot.quantity` vient de la
 *  table product_components, ex. un combo peut inclure 2× frites. */
export interface ProductComponent {
  id: number;
  name: string;
  price: number | string;
  pivot: { quantity: number };
  /** Uniquement renseigné pour les options d'un groupe de menu (voir MenuGroup.options,
   *  ProductController::WITH menuGroups.options.ingredients) — permet de proposer la même
   *  personnalisation ("sans oignon") pour un produit choisi À L'INTÉRIEUR d'un menu que pour ce
   *  même produit vendu seul (voir Product.ingredients). Absent pour un composant de combo. */
  ingredients?: ProductIngredient[];
}

/** write-only : payload create/update pour la composition d'un combo (voir `component_ids`
 *  côté Product ci-dessous) — distinct du champ de lecture `components`. */
export interface ProductComponentPayload {
  product_id: number;
  quantity: number;
}

/** Ingrédient global (voir Ingredient dans reference.model.ts pour la liste brute) rattaché à un
 *  produit — `pivot.removable` détermine si le client peut le décocher au panier (ex. le pain
 *  d'un burger reste coché mais non décochable), voir la modale de personnalisation panier. */
export interface ProductIngredient {
  id: number;
  name: string;
  pivot: { removable: boolean };
}

/** write-only : payload create/update pour les ingrédients d'un produit (voir `ingredient_ids`
 *  côté Product ci-dessous) — distinct du champ de lecture `ingredients`. */
export interface ProductIngredientPayload {
  ingredient_id: number;
  removable: boolean;
}

/** Un groupe de choix d'un menu (voir Product.menu_groups) — le client choisit entre min_choices
 *  et max_choices produits parmi `options` au moment de la commande (voir App\Support\MenuResolver
 *  côté API). Contrairement à un combo, il n'y a pas de quantité fixe par produit. */
export interface MenuGroup {
  id: number;
  label: string;
  min_choices: number;
  max_choices: number;
  position: number;
  options: ProductComponent[];
}

/** write-only : payload create/update pour les groupes de choix d'un menu (voir `menu_groups`
 *  côté Product ci-dessous) — remplacement complet à chaque sauvegarde côté API. */
export interface MenuGroupPayload {
  label: string;
  min_choices: number;
  max_choices: number;
  product_ids: number[];
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  /** Laravel renvoie les decimal:2 en JSON comme des chaînes (ex. "3.50"), pas des nombres. */
  price: number | string;
  /** Minutes — sert au kitchen display à afficher un minuteur une fois la section demandée en
   *  cuisine (voir erp_kitchen_display/kitchen-board.ts). Nullable : pas de minuteur affiché si non renseigné. */
  preparation_time: number | null;
  sku: string | null;
  active: boolean;
  /** Stock suivi pour ce produit — `null` = non suivi (disponibilité illimitée, comportement par
   *  défaut). Décrémenté côté serveur à chaque vente réelle (voir App\Support\StockManager),
   *  jamais recalculé ici : cette valeur peut être légèrement périmée entre deux rafraîchissements
   *  de la liste produits, le serveur reste la seule source de vérité au paiement. */
  stock_quantity: number | null;
  /** Un combo est un Product normal (même panier/ticket/facturation) — is_combo sert uniquement
   *  à savoir qu'il faut charger/afficher sa composition, notamment pour l'éclater en plats
   *  individuels au Kitchen Display (voir erp_kitchen_display/kitchen-board.ts). */
  is_combo: boolean;
  /** Un menu est un Product normal (même panier/ticket/facturation, prix fixe) — is_menu sert
   *  uniquement à savoir qu'il faut charger/afficher ses groupes de choix. Contrairement à un
   *  combo (composition fixe), le client choisit un ou plusieurs produits par groupe au moment
   *  de la commande (voir menu_groups). */
  is_menu: boolean;
  /** Réglage propre à un menu (is_menu=true) : répartit chaque groupe dans sa propre section de
   *  commande (une par label de groupe) au lieu de la section active du serveur — voir
   *  OrderLineController::addMenu côté API. Sans effet en dehors du POS Restaurant. */
  split_by_section: boolean;
  tax_id: number | null;
  station_id: number | null;
  product_category_id: number | null;
  /** Icône (emoji) choisie par l'admin — mutuellement exclusive avec image_url (voir
   *  App\Support\ImageUpload côté API) : au plus un des deux est renseigné à la fois. */
  icon: string | null;
  /** URL publique de l'image uploadée (voir ProductController::uploadImage) — calculée côté
   *  serveur, jamais construite ici. Repli existant si les deux sont absents : voir
   *  productEmoji() dans chaque écran d'affichage (pos-vente.ts, order-builder.ts, etc). */
  image_url: string | null;
  station?: Station | null;
  category?: ProductCategory | null;
  /** Many-to-many désormais : un produit peut appartenir à plusieurs catalogues. */
  catalogs?: ProductCatalog[];
  /** write-only : envoyé en payload create/update, jamais renvoyé tel quel (voir `catalogs`). */
  catalog_ids?: number[];
  tax?: Tax | null;
  /** Composition d'un combo (is_combo=true) — vide/absent pour un produit normal. */
  components?: ProductComponent[];
  /** write-only : envoyé en payload create/update (voir `components`). */
  component_ids?: ProductComponentPayload[];
  /** Groupes de choix d'un menu (is_menu=true) — vide/absent pour un produit normal/combo. */
  menu_groups?: MenuGroup[];
  /** write-only : envoyé en payload create/update (voir `menu_groups`). */
  menu_group_ids?: MenuGroupPayload[];
  /** Ingrédients de ce produit, retirables ou non au panier — voir la modale de personnalisation
   *  panier (pos-vente.ts/order-builder.ts/...). */
  ingredients?: ProductIngredient[];
  /** write-only : envoyé en payload create/update (voir `ingredients`). */
  ingredient_ids?: ProductIngredientPayload[];
}
