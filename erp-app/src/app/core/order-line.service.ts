import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { OrderLine } from './models/order.model';
import { MenuChoice } from './models/menu-choice.model';

@Injectable({ providedIn: 'root' })
export class OrderLineService {
  private readonly http = inject(HttpClient);

  /** Incrémente côté backend si ce produit est déjà présent dans la section AVEC LA MÊME note —
   *  pas de doublon (voir OrderLineController::store, fusion par product_id+note). `menuChoices`
   *  requis uniquement pour un produit `is_menu` (voir App\Support\MenuResolver côté API) — un
   *  seul produit par ligne ajouté à la fois, contrairement à Ticket/SelfOrder/Kiosk qui envoient
   *  un panier entier en une fois. `quantity` (défaut 1) permet d'ajouter plusieurs exemplaires
   *  d'un même menu (même configuration de choix) en un seul appel, via le compteur de la modale
   *  de choix. `note` : résumé des ingrédients retirés (voir Product.ingredients/modale de
   *  personnalisation), ex. "Sans oignon" — jamais utilisé conjointement à menuChoices. */
  add(orderSectionId: number, productId: number, menuChoices?: MenuChoice[], quantity?: number, note?: string | null): Observable<OrderLine> {
    return this.http.post<OrderLine>(`${API_URL}/order-sections/${orderSectionId}/lines`, {
      product_id: productId,
      menu_choices: menuChoices,
      quantity,
      note,
    });
  }

  updateQuantity(id: number, quantity: number): Observable<OrderLine> {
    return this.http.put<OrderLine>(`${API_URL}/order-lines/${id}`, { quantity });
  }

  updateNote(id: number, note: string | null): Observable<OrderLine> {
    return this.http.put<OrderLine>(`${API_URL}/order-lines/${id}`, { note });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${API_URL}/order-lines/${id}`);
  }

  /** Retire un menu entier (voir OrderLineController::destroyMenu) : `id` doit être la ligne
   *  PORTEUSE (product.is_menu, priced=true) — supprime aussi tous ses composants, y compris ceux
   *  répartis dans d'autres sections (voir Product.split_by_section). Ni remove() ni
   *  updateQuantity() n'acceptent une ligne de menu (voir isMenuLine côté order-builder.ts). */
  removeMenu(id: number): Observable<void> {
    return this.http.delete<void>(`${API_URL}/order-lines/${id}/menu`);
  }
}
