import { ProductCatalog, ProductCategory } from './catalog.model';
import { Station, Tax } from './reference.model';

/** Un produit qui compose un combo (voir Product.components) — `pivot.quantity` vient de la
 *  table product_components, ex. un combo peut inclure 2× frites. */
export interface ProductComponent {
  id: number;
  name: string;
  price: number | string;
  pivot: { quantity: number };
}

/** write-only : payload create/update pour la composition d'un combo (voir `component_ids`
 *  côté Product ci-dessous) — distinct du champ de lecture `components`. */
export interface ProductComponentPayload {
  product_id: number;
  quantity: number;
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
  /** Un combo est un Product normal (même panier/ticket/facturation) — is_combo sert uniquement
   *  à savoir qu'il faut charger/afficher sa composition, notamment pour l'éclater en plats
   *  individuels au Kitchen Display (voir erp_kitchen_display/kitchen-board.ts). */
  is_combo: boolean;
  tax_id: number | null;
  station_id: number | null;
  product_category_id: number | null;
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
}
