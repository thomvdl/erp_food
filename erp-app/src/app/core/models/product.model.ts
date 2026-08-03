import { ProductCatalog, ProductCategory } from './catalog.model';
import { Station, Tax } from './reference.model';

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
}
