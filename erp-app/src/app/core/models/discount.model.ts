import { Product } from './product.model';

export type DiscountType = 'percentage' | 'fixed_amount' | 'free_product';

export interface Discount {
  id: number;
  code: string;
  type: DiscountType;
  /** % (0-100) pour "percentage", montant en € pour "fixed_amount", null pour "free_product". */
  value: number | string | null;
  /** Seuil d'éligibilité optionnel : montant d'achat minimum requis pour utiliser le code (voir
   *  DiscountCalculator::amountOff) — une fois atteint, la réduction s'applique en entier, sans
   *  plafonnement. Null = pas de seuil. */
  minimum_total: number | string | null;
  free_product_id: number | null;
  free_product?: Product | null;
  /** "YYYY-MM-DD" — période de validité, bornes incluses (voir DiscountCalculator::resolve). */
  starts_at: string;
  ends_at: string;
  /** "Ne plus avoir la possibilité de supprimer... ajouter un champ active" (voir Readme.md). */
  active: boolean;
}

/** Réponse de POST /discounts/validate — aperçu live avant paiement (voir DiscountController::validateCode). */
export interface ValidateDiscountResponse {
  discount: Discount;
  amount_off: number;
}
