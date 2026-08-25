import { Injectable, inject, signal } from '@angular/core';
import { CustomerService } from './customer.service';
import { Customer } from './models/customer.model';

const STORAGE_KEY = 'erp_public_shop.customer';
/** Clé de retour mémorisée avant la navigation pleine page vers Google (voir loginWithGoogle) —
 *  sessionStorage et non localStorage : n'a de sens que pour cet aller-retour, pas au-delà. */
const RETURN_URL_KEY = 'erp_public_shop.post_login_return_url';

/**
 * État partagé entre le panneau topbar (voir shared/customer-login), pages/login (connexion,
 * obligatoire avant toute navigation — voir core/auth.guard.ts), pages/checkout (pré-remplissage +
 * points) et pages/dashboard — même principe que CartService/DeliveryAddressService (signal +
 * persistance localStorage). Trois façons de prouver l'identité : email + mot de passe (voir
 * register()/authenticate()), un code à 6 chiffres par email (voir
 * requestOtp()/verifyOtp()/cancelPendingOtp()), ou une connexion Google (voir
 * loginWithGoogle()/completeGoogleLogin()) — voir ShopCustomerController côté API pour le détail,
 * notamment l'arbitrage assumé de register() (un mot de passe seul ne prouve pas la possession de
 * l'email, contrairement au code par email ou à Google). "Se déconnecter" reste un simple oubli
 * local, aucun vrai token de session.
 */
@Injectable({ providedIn: 'root' })
export class CustomerSessionService {
  private readonly customerService = inject(CustomerService);

  readonly customer = signal<Customer | null>(this.restore());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Vrai après requestOtp() sur un email inconnu sans nom fourni — pages/login doit alors
   *  demander prénom/nom avant de rappeler requestOtp() avec. */
  readonly needsOtpSignup = signal(false);
  /** Vrai après un requestOtp() réussi (code envoyé) — pages/login doit alors afficher le champ de
   *  saisie du code plutôt que le formulaire email. */
  readonly pendingOtp = signal(false);

  private pendingOtpEmail = '';

  register(email: string, password: string, firstname: string, lastname: string, phone: string | null): void {
    if (this.loading()) return;

    this.loading.set(true);
    this.error.set(null);

    this.customerService.register(email.trim(), password, firstname.trim(), lastname.trim(), phone?.trim() || null).subscribe({
      next: (customer) => {
        this.loading.set(false);
        this.customer.set(customer);
        this.persist(customer);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.errors?.email?.[0] ?? err.error?.message ?? "Impossible de créer le compte.");
      },
    });
  }

  requestOtp(email: string, firstname?: string, lastname?: string): void {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);
    this.needsOtpSignup.set(false);

    this.customerService.requestOtp(trimmedEmail, firstname?.trim(), lastname?.trim()).subscribe({
      next: (result) => {
        this.loading.set(false);
        if (result.exists === false) {
          this.needsOtpSignup.set(true);
          return;
        }
        this.pendingOtpEmail = trimmedEmail;
        this.pendingOtp.set(true);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? "Impossible d'envoyer le code.");
      },
    });
  }

  verifyOtp(code: string): void {
    const trimmed = code.trim();
    if (!trimmed || this.loading() || !this.pendingOtp()) return;

    this.loading.set(true);
    this.error.set(null);

    this.customerService.verifyOtp(this.pendingOtpEmail, trimmed).subscribe({
      next: (customer) => {
        this.loading.set(false);
        this.pendingOtp.set(false);
        this.customer.set(customer);
        this.persist(customer);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Code invalide ou expiré.');
      },
    });
  }

  /** Retour au formulaire email depuis l'écran de saisie du code (ex. mauvaise adresse saisie) —
   *  n'annule pas le code déjà envoyé côté serveur, juste l'affichage local. */
  cancelPendingOtp(): void {
    this.pendingOtp.set(false);
    this.needsOtpSignup.set(false);
    this.error.set(null);
  }

  authenticate(email: string, password: string): void {
    if (this.loading()) return;

    this.loading.set(true);
    this.error.set(null);

    this.customerService.authenticate(email.trim(), password).subscribe({
      next: (customer) => {
        this.loading.set(false);
        this.customer.set(customer);
        this.persist(customer);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.errors?.email?.[0] ?? err.error?.message ?? 'Identifiants invalides.');
      },
    });
  }

  /** Rafraîchit le solde de points après une commande (voir pages/checkout) — le customer stocké
   *  ne se met pas à jour tout seul après un achat. */
  refresh(): void {
    const current = this.customer();
    if (!current) return;
    this.customerService.login(current.phone, current.email).subscribe({
      next: (result) => {
        if (!('exists' in result)) {
          this.customer.set(result);
          this.persist(result);
        }
      },
    });
  }

  /** Déclenche la connexion Google — navigation pleine page (voir CustomerService.googleRedirectUrl),
   *  jamais un appel XHR. `returnUrl` (chemin relatif, ex. "/checkout") est mémorisé pour que
   *  pages/auth-callback sache où renvoyer l'utilisateur une fois revenu de Google. */
  loginWithGoogle(returnUrl: string): void {
    try {
      sessionStorage.setItem(RETURN_URL_KEY, returnUrl);
    } catch {
      // Sans conséquence — voir persist()/logout(), au pire l'utilisateur atterrit sur l'accueil.
    }
    window.location.href = this.customerService.googleRedirectUrl();
  }

  /** Lit puis efface l'URL de retour mémorisée par loginWithGoogle() — usage unique, voir
   *  pages/auth-callback. */
  consumeReturnUrl(): string {
    try {
      const url = sessionStorage.getItem(RETURN_URL_KEY);
      sessionStorage.removeItem(RETURN_URL_KEY);
      return url || '/';
    } catch {
      return '/';
    }
  }

  /** Voir pages/auth-callback — échange le token reçu au retour de Google (voir
   *  ShopCustomerController::exchangeGoogleToken) contre le client, même traitement que
   *  register()/authenticate(). */
  completeGoogleLogin(token: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.customerService.exchangeGoogleToken(token).subscribe({
      next: (customer) => {
        this.loading.set(false);
        this.customer.set(customer);
        this.persist(customer);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Connexion Google impossible.');
      },
    });
  }

  logout(): void {
    this.customer.set(null);
    this.needsOtpSignup.set(false);
    this.pendingOtp.set(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Sans conséquence — voir CartService pour la même tolérance.
    }
  }

  private persist(customer: Customer): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customer));
    } catch {
      // Voir logout().
    }
  }

  private restore(): Customer | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
