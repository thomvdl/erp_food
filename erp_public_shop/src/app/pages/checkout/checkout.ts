import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CartService } from '../../core/cart.service';
import { ClientAddressService } from '../../core/client-address.service';
import { ShopService } from '../../core/shop.service';
import { DeliveryAddressService } from '../../core/delivery-address.service';
import { IS_DEV_MODE } from '../../core/dev-mode';
import { FulfillmentType, ShopCheckoutResponse } from '../../core/models/shop.model';
import { DeliveryAddress } from '../../shared/delivery-address/delivery-address';
import { CustomerLogin } from '../../shared/customer-login/customer-login';
import { CustomerSessionService } from '../../core/customer-session.service';

/**
 * Récap du panier (voir CartService, partagé avec pages/catalog) + choix du mode de retrait avant
 * paiement Stripe Checkout hébergé (voir ShopCheckoutController::store côté API). L'adresse de
 * livraison n'est plus demandée ici ni par Stripe : elle est saisie/validée dans la topbar (voir
 * DeliveryAddressService, partagé avec pages/catalog) — cette page se contente d'en exiger une
 * validée (dans le rayon de livraison, voir App\Support\DeliveryZone côté API) avant d'autoriser
 * le paiement quand "Livraison" est choisi. Si un compte client est connecté (voir
 * CustomerSessionService, partagé avec la topbar), pré-remplit l'email, et si aucune adresse n'est
 * déjà saisie/validée cette session, pré-remplit + revalide automatiquement son adresse par défaut
 * (voir pages/dashboard, ClientAddressService) — n'écrase jamais une adresse déjà en cours de
 * saisie dans la topbar. La dépense de points de fidélité n'est volontairement plus proposée ici
 * côté front pour le moment (voir demande produit) — le backend (ShopCheckoutController::store)
 * l'accepte toujours si `points_redeemed` est envoyé, gardé tel quel pour une réactivation
 * ultérieure sans migration.
 */
@Component({
  selector: 'app-checkout',
  imports: [FormsModule, DeliveryAddress, CustomerLogin],
  templateUrl: './checkout.html',
  styleUrl: './checkout.css',
})
export class Checkout {
  private readonly router = inject(Router);
  private readonly shopService = inject(ShopService);
  private readonly clientAddressService = inject(ClientAddressService);
  readonly cart = inject(CartService);
  readonly deliveryAddress = inject(DeliveryAddressService);
  readonly customerSession = inject(CustomerSessionService);

  readonly fulfillmentType = signal<FulfillmentType>('pickup');
  readonly customerEmail = signal('');
  readonly discountCode = signal('');
  readonly deliveryFee = signal(0);
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);
  /** Bouton "Simuler le paiement" — masqué en prod (voir dev-mode.ts), le vrai garde-fou reste
   *  côté serveur (ShopCheckoutController::simulate renvoie 404 hors dev/test). */
  readonly isDevMode = IS_DEV_MODE;

  /** Aperçu — ne tient pas compte d'un éventuel code promo (pas de vérification live, voir
   *  discountCode ci-dessus), le vrai total vient toujours de la réponse serveur. */
  readonly total = computed(() => this.cart.total() + (this.fulfillmentType() === 'delivery' ? this.deliveryFee() : 0));

  /** Email du compte connecté si disponible (déjà vérifié par code, voir
   *  CustomerSessionService/shared/customer-login) — sinon celui saisi ici. Un client connecté n'a
   *  jamais à le ressaisir (voir checkout.html, champ masqué dans ce cas). */
  readonly effectiveEmail = computed(() => this.customerSession.customer()?.email ?? this.customerEmail());

  /** L'email est obligatoire (confirmation de commande) — revalidé côté serveur (voir
   *  ShopCheckoutController::store), ce n'est qu'un contrôle de confort ici. */
  readonly hasValidEmail = computed(() => /\S+@\S+\.\S+/.test(this.effectiveEmail().trim()));

  /** Bloque le paiement tant qu'aucune adresse validée dans le rayon n'est disponible — la vraie
   *  revérification a de toute façon lieu côté serveur (voir createCheckout()), ceci n'évite
   *  qu'un aller-retour inutile au client. */
  readonly canSubmit = computed(
    () => this.hasValidEmail() && (this.fulfillmentType() === 'pickup' || this.deliveryAddress.result()?.within_radius === true),
  );

  constructor() {
    if (this.cart.lines().length === 0) {
      this.router.navigateByUrl('/');
      return;
    }

    // Juste pour l'aperçu affiché ici — le montant réellement facturé est toujours recalculé côté
    // serveur à la soumission (voir docblock de ShopCatalogController::index).
    this.shopService.getCatalog().subscribe({
      next: (catalog) => this.deliveryFee.set(catalog.delivery_fee),
      error: () => undefined,
    });

    const customer = this.customerSession.customer();
    if (customer && !this.deliveryAddress.result()) {
      this.clientAddressService.list(customer.phone, customer.email).subscribe({
        next: (addresses) => {
          const defaultAddress = addresses.find((a) => a.is_default);
          // Re-vérifie qu'aucune adresse n'a été saisie entre-temps dans la topbar pendant que
          // cet appel était en vol — ne jamais écraser une saisie en cours.
          if (defaultAddress && !this.deliveryAddress.result()) {
            this.deliveryAddress.check(defaultAddress.address);
          }
        },
        error: () => undefined,
      });
    }
  }

  formatMoney(value: number | string): string {
    return Number(value).toFixed(2) + ' €';
  }

  lineTotal(line: { product: { price: number | string }; quantity: number }): number {
    return Number(line.product.price) * line.quantity;
  }

  back(): void {
    this.router.navigateByUrl('/');
  }

  submit(): void {
    this.createCheckout((res) => {
      // Pas de cart.clear() ici : si le client revient en arrière depuis Stripe sans payer
      // (onglet fermé, navigation manuelle), le panier doit rester composé — seule une
      // confirmation de paiement réussie (pages/confirmation) justifie de le vider.
      window.location.href = res.checkout_url;
    });
  }

  /** Bouton de test (dev/test uniquement, voir isDevMode) : crée le même ShopCheckout qu'un
   *  paiement réel, mais appelle ShopCheckoutController::simulate au lieu de rediriger vers
   *  Stripe — évite de ressaisir une carte de test à chaque essai. */
  simulate(): void {
    this.createCheckout((res) => {
      this.shopService.simulatePayment(res.id).subscribe({
        next: () => {
          this.submitting.set(false);
          this.customerSession.refresh();
          this.router.navigateByUrl(`/confirmation?checkout=${res.id}&status=success`);
        },
        error: (err) => {
          this.submitting.set(false);
          this.submitError.set(err.error?.message ?? 'Impossible de simuler le paiement.');
        },
      });
    });
  }

  private createCheckout(onSuccess: (res: ShopCheckoutResponse) => void): void {
    if (this.cart.lines().length === 0 || this.submitting() || !this.canSubmit()) return;
    this.submitting.set(true);
    this.submitError.set(null);

    this.shopService
      .checkout({
        fulfillment_type: this.fulfillmentType(),
        customer_email: this.effectiveEmail() || null,
        customer_phone: this.customerSession.customer()?.phone ?? null,
        delivery_address: this.fulfillmentType() === 'delivery' ? this.deliveryAddress.result()?.formatted_address : null,
        discount_code: this.discountCode().trim() || null,
        lines: this.cart.lines().map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
          note: line.note || null,
          menu_choices: line.menuChoices,
        })),
      })
      .subscribe({
        next: onSuccess,
        error: (err) => {
          this.submitting.set(false);
          const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
          this.submitError.set((messages?.length ? messages.join(' ') : err.error?.message) ?? 'Impossible de préparer le paiement.');
        },
      });
  }
}
