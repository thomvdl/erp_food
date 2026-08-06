import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';
import { API_URL } from './api-config';
import { CachedResourceService } from './cached-resource.service';
import { Discount, ValidateDiscountResponse } from './models/discount.model';

@Injectable({ providedIn: 'root' })
export class DiscountService extends CachedResourceService<Discount> {
  protected readonly endpoint = 'discounts';

  /** Aperçu live d'un code avant paiement (voir DiscountController::validateCode) — ne fait rien
   *  d'irréversible, le paiement réel revalide indépendamment côté serveur. */
  validate(code: string, lines: { product_id: number; quantity: number }[]): Observable<ValidateDiscountResponse> {
    return this.http.post<ValidateDiscountResponse>(`${API_URL}/discounts/validate`, { code, lines });
  }
}
