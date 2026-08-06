import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_URL } from './api-config';
import {
  CashSession,
  CreateKioskOrderPayload,
  OpenCashSessionPayload,
  PaymentMethod,
  Product,
  ProductCatalog,
  Ticket,
  ValidateDiscountResponse,
} from './models/kiosk.model';

/**
 * Regroupe les quelques appels authentifiés dont le mode kiosque a besoin. Le checkout passe par
 * POST /kiosk-orders (KioskOrderController côté API), pas /tickets : contrairement à une vente
 * directe classique, une commande kiosque doit AUSSI apparaître en cuisine (voir Readme.md,
 * "quand on est en mode kiosk la commande n'est jamais envoyée en cuisine") — cet endpoint crée à
 * la fois le Ticket (encaissement immédiat) et l'Order de cuisine (state 'ask' dès la création,
 * comme le mode QR) en une seule requête.
 */
@Injectable({ providedIn: 'root' })
export class KioskService {
  private readonly http = inject(HttpClient);

  listProducts(): Observable<Product[]> {
    return this.http.get<Product[]>(`${API_URL}/products`);
  }

  listCatalogs(): Observable<ProductCatalog[]> {
    return this.http.get<ProductCatalog[]>(`${API_URL}/product-catalogs`);
  }

  listPaymentMethods(): Observable<PaymentMethod[]> {
    return this.http.get<PaymentMethod[]>(`${API_URL}/payment-methods`);
  }

  /** Le backend renvoie {} (pas null) quand il n'y a pas de session ouverte — comportement de
   *  Laravel/Symfony sur response()->json(null) (voir CashSessionController::active). {} est
   *  "truthy" en JS, donc sans ce mapping le kiosque afficherait "Caisse ouverte" pour n'importe
   *  quel utilisateur sans session — même contournement que erp-app/core/cash-session.service.ts. */
  activeCashSession(userId: number): Observable<CashSession | null> {
    return this.http
      .get<CashSession | Record<string, never>>(`${API_URL}/cash-sessions/active`, { params: { user_id: userId } })
      .pipe(map((session) => ('id' in session ? (session as CashSession) : null)));
  }

  openCashSession(payload: OpenCashSessionPayload): Observable<CashSession> {
    return this.http.post<CashSession>(`${API_URL}/cash-sessions`, payload);
  }

  createKioskOrder(payload: CreateKioskOrderPayload): Observable<Ticket> {
    return this.http.post<Ticket>(`${API_URL}/kiosk-orders`, payload);
  }

  /** Aperçu live d'un code promo avant paiement (voir DiscountController::validateCode) — le
   *  paiement réel revalide indépendamment côté serveur. */
  validateDiscount(code: string, lines: { product_id: number; quantity: number }[]): Observable<ValidateDiscountResponse> {
    return this.http.post<ValidateDiscountResponse>(`${API_URL}/discounts/validate`, { code, lines });
  }
}
