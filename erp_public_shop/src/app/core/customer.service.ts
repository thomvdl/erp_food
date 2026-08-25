import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { Customer, CustomerLoginResult, CustomerOrder, RequestOtpResult } from './models/customer.model';

/** Voir ShopCustomerController côté API — trois méthodes : email + mot de passe (voir
 *  register/authenticate), code par email (voir requestOtp/verifyOtp), ou Google (voir
 *  googleRedirectUrl/exchangeGoogleToken) — désormais obligatoire pour commander (voir
 *  core/auth.guard.ts). */
@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly http = inject(HttpClient);

  register(email: string, password: string, firstname: string, lastname: string, phone: string | null): Observable<Customer> {
    return this.http.post<Customer>(`${API_URL}/shop/customer/register`, { email, password, firstname, lastname, phone });
  }

  authenticate(email: string, password: string): Observable<Customer> {
    return this.http.post<Customer>(`${API_URL}/shop/customer/authenticate`, { email, password });
  }

  requestOtp(email: string, firstname?: string, lastname?: string): Observable<RequestOtpResult> {
    return this.http.post<RequestOtpResult>(`${API_URL}/shop/customer/otp/request`, { email, firstname, lastname });
  }

  verifyOtp(email: string, code: string): Observable<Customer> {
    return this.http.post<Customer>(`${API_URL}/shop/customer/otp/verify`, { email, code });
  }

  /** Retrouve un compte déjà connecté sur cet appareil sans redemander de code — voir
   *  CustomerSessionService.refresh(). `phone`/`email` : voir ShopCustomerController::login, au
   *  moins l'un des deux est requis (un compte Google n'a pas forcément de téléphone). */
  login(phone: string | null, email: string | null): Observable<Customer | CustomerLoginResult> {
    return this.http.post<Customer | CustomerLoginResult>(`${API_URL}/shop/customer/login`, { phone, email });
  }

  getOrders(phone: string | null, email: string | null): Observable<CustomerOrder[]> {
    return this.http.post<CustomerOrder[]>(`${API_URL}/shop/customer/orders`, { phone, email });
  }

  /** URL de redirection pleine page vers Google (voir ShopCustomerController::redirectToGoogle) —
   *  jamais un appel XHR, OAuth exige une navigation top-level. */
  googleRedirectUrl(): string {
    return `${API_URL}/shop/customer/google/redirect`;
  }

  /** Échange le token à usage unique reçu au retour de Google (voir pages/auth-callback) contre le
   *  client — voir ShopCustomerController::exchangeGoogleToken. */
  exchangeGoogleToken(token: string): Observable<Customer> {
    return this.http.post<Customer>(`${API_URL}/shop/customer/google/exchange`, { token });
  }
}
