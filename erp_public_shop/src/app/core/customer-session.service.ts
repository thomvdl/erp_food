import { Injectable, inject, signal } from '@angular/core';
import { CustomerService } from './customer.service';
import { Customer } from './models/customer.model';

const STORAGE_KEY = 'erp_public_shop.customer';

/**
 * État partagé entre le panneau topbar (voir shared/customer-login), pages/checkout (pré-
 * remplissage + points) et pages/order-history — même principe que CartService/
 * DeliveryAddressService (signal + persistance localStorage). La connexion se fait en deux temps
 * (voir requestCode()/verifyCode() ci-dessous) : un code à 6 chiffres envoyé par email prouve la
 * possession de l'adresse, seule vraie vérification du compte (voir ShopCustomerController côté
 * API pour le détail — l'ancienne identification par téléphone seul a été jugée trop faible).
 * "Se déconnecter" reste un simple oubli local, aucun vrai token de session.
 */
@Injectable({ providedIn: 'root' })
export class CustomerSessionService {
  private readonly customerService = inject(CustomerService);

  readonly customer = signal<Customer | null>(this.restore());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Vrai après requestCode() sur un numéro inconnu sans nom fourni — le composant topbar doit
   *  alors demander prénom/nom avant de rappeler requestCode() avec. */
  readonly needsSignup = signal(false);
  /** Vrai après un requestCode() réussi (code envoyé) — le composant topbar doit alors afficher le
   *  champ de saisie du code plutôt que le formulaire téléphone/email. */
  readonly pendingCode = signal(false);

  private pendingPhone = '';
  private pendingEmail = '';

  requestCode(phone: string, email: string, firstname?: string, lastname?: string): void {
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();
    if (!trimmedPhone || !trimmedEmail || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);
    this.needsSignup.set(false);

    this.customerService.requestCode(trimmedPhone, trimmedEmail, firstname?.trim(), lastname?.trim()).subscribe({
      next: (result) => {
        this.loading.set(false);
        if (result.exists === false) {
          this.needsSignup.set(true);
          return;
        }
        this.pendingPhone = trimmedPhone;
        this.pendingEmail = trimmedEmail;
        this.pendingCode.set(true);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? "Impossible d'envoyer le code.");
      },
    });
  }

  verifyCode(code: string): void {
    const trimmed = code.trim();
    if (!trimmed || this.loading() || !this.pendingCode()) return;

    this.loading.set(true);
    this.error.set(null);

    this.customerService.verifyCode(this.pendingPhone, this.pendingEmail, trimmed).subscribe({
      next: (customer) => {
        this.loading.set(false);
        this.pendingCode.set(false);
        this.customer.set(customer);
        this.persist(customer);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Code invalide ou expiré.');
      },
    });
  }

  /** Retour au formulaire téléphone/email depuis l'écran de saisie du code (ex. mauvais numéro
   *  saisi) — n'annule pas le code déjà envoyé côté serveur, juste l'affichage local. */
  cancelPendingCode(): void {
    this.pendingCode.set(false);
    this.needsSignup.set(false);
    this.error.set(null);
  }

  /** Rafraîchit le solde de points après une commande (voir pages/checkout) — le customer stocké
   *  ne se met pas à jour tout seul après un achat. */
  refresh(): void {
    const current = this.customer();
    if (!current) return;
    this.customerService.login(current.phone).subscribe({
      next: (result) => {
        if (!('exists' in result)) {
          this.customer.set(result);
          this.persist(result);
        }
      },
    });
  }

  logout(): void {
    this.customer.set(null);
    this.needsSignup.set(false);
    this.pendingCode.set(false);
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
