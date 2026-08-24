import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { Customer, CustomerLoginResult, CustomerOrder, RequestCodeResult } from './models/customer.model';

/** Voir ShopCustomerController côté API — identification par téléphone + email vérifié par code
 *  (voir requestCode/verifyCode), jamais obligatoire pour commander (voir
 *  CartService/ShopService.checkout). */
@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly http = inject(HttpClient);

  requestCode(phone: string, email: string, firstname?: string, lastname?: string): Observable<RequestCodeResult> {
    return this.http.post<RequestCodeResult>(`${API_URL}/shop/customer/request-code`, { phone, email, firstname, lastname });
  }

  verifyCode(phone: string, email: string, code: string): Observable<Customer> {
    return this.http.post<Customer>(`${API_URL}/shop/customer/verify-code`, { phone, email, code });
  }

  /** Retrouve un compte déjà connecté sur cet appareil sans redemander de code — voir
   *  CustomerSessionService.refresh(). */
  login(phone: string): Observable<Customer | CustomerLoginResult> {
    return this.http.post<Customer | CustomerLoginResult>(`${API_URL}/shop/customer/login`, { phone });
  }

  getOrders(phone: string): Observable<CustomerOrder[]> {
    return this.http.post<CustomerOrder[]>(`${API_URL}/shop/customer/orders`, { phone });
  }
}
