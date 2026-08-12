import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { OrderLine } from './models/order.model';
import { MenuChoice } from './models/menu-choice.model';

@Injectable({ providedIn: 'root' })
export class OrderLineService {
  private readonly http = inject(HttpClient);

  /** Incrémente côté backend si ce produit est déjà présent dans la section — pas de doublon.
   *  `menuChoices` requis uniquement pour un produit `is_menu` (voir App\Support\MenuResolver
   *  côté API) — un seul produit par ligne ajouté à la fois, contrairement à Ticket/SelfOrder/
   *  Kiosk qui envoient un panier entier en une fois. `quantity` (défaut 1) permet d'ajouter
   *  plusieurs exemplaires d'un même menu (même configuration de choix) en un seul appel, via le
   *  compteur de la modale de choix. */
  add(orderSectionId: number, productId: number, menuChoices?: MenuChoice[], quantity?: number): Observable<OrderLine> {
    return this.http.post<OrderLine>(`${API_URL}/order-sections/${orderSectionId}/lines`, {
      product_id: productId,
      menu_choices: menuChoices,
      quantity,
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
