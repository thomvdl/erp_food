import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CartService } from '../../core/cart.service';
import { ClientAddressService } from '../../core/client-address.service';
import { ShopService } from '../../core/shop.service';
import { DeliveryAddressService } from '../../core/delivery-address.service';
import { IS_DEV_MODE } from '../../core/dev-mode';
import { FulfillmentTiming, FulfillmentType, ShopCheckoutResponse } from '../../core/models/shop.model';
import { DeliveryAddress } from '../../shared/delivery-address/delivery-address';
import { CustomerLogin } from '../../shared/customer-login/customer-login';
import { CustomerSessionService } from '../../core/customer-session.service';

/** Même ordre que App\Support\ShopOpeningHours::DAY_KEYS côté API (CSV `shop_open_days`) — pas
 *  les numéros ISO pour rester lisible. */
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** "Max J+5" (demande explicite) — revalidé de toute façon côté serveur (voir
 *  ShopCheckoutController::store), cette limite n'est qu'une aide à la sélection. */
const MAX_DAYS_AHEAD = 5;
/** "Ajoute l'heure par créneau de 15 min" (demande explicite). */
const SLOT_MINUTES = 15;

interface ScheduleDateOption {
  /** "YYYY-MM-DD", format natif d'un <input type="date"> — envoyé tel quel côté serveur, combiné
   *  à l'heure choisie (voir submit()). */
  value: string;
  label: string;
}

function dayKeyOf(date: Date): (typeof DAY_KEYS)[number] {
  const iso = date.getDay() === 0 ? 7 : date.getDay();
  return DAY_KEYS[iso - 1];
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateInputValue(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

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
  /** Réglage Paramètres > Réglages "shop_delivery_available" — masque l'onglet "Livraison"
   *  ci-dessous quand false ; revalidé de toute façon côté serveur (voir createCheckout()). */
  readonly deliveryAvailable = signal(true);
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);
  /** Voir App\Support\ShopOpeningHours côté API — le catalogue reste accessible hors horaires,
   *  seule la soumission est bloquée ici (canSubmit ci-dessous) + revérifiée côté serveur de
   *  toute façon (voir createCheckout()). */
  readonly closedMessage = signal<string | null>(null);

  /** "Dès que possible" ou "différé" — voir App\Support\ShopOpeningHours côté API. */
  readonly timing = signal<FulfillmentTiming>('asap');
  /** "YYYY-MM-DD" (valeur native d'un <input type="date">) — vide tant qu'aucune date choisie. */
  readonly scheduledDate = signal('');
  /** "HH:mm" — vide tant qu'aucune heure choisie. */
  readonly scheduledTime = signal('');
  private readonly openDays = signal<string[] | null>(null);
  private readonly openAt = signal<string | null>(null);
  private readonly closeAt = signal<string | null>(null);

  /** Aujourd'hui + jusqu'à 5 jours, filtrés sur les jours d'ouverture ET sur le fait qu'il reste
   *  au moins un créneau valide ce jour-là (exclut "aujourd'hui" une fois les horaires dépassés). */
  readonly availableDates = computed<ScheduleDateOption[]>(() => {
    const openDays = this.openDays();
    const options: ScheduleDateOption[] = [];
    const today = new Date();

    for (let i = 0; i <= MAX_DAYS_AHEAD; i++) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      if (openDays !== null && !openDays.includes(dayKeyOf(date))) continue;
      if (this.timesFor(date).length === 0) continue;

      const label =
        i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
      options.push({ value: toDateInputValue(date), label });
    }

    return options;
  });

  /** Créneaux de 15 min pour la date actuellement choisie — recalculés à chaque changement de
   *  date (voir selectDate()), jamais pour une date qui ne serait pas dans availableDates(). */
  readonly availableTimes = computed<string[]>(() => {
    const value = this.scheduledDate();
    return value ? this.timesFor(parseDateInputValue(value)) : [];
  });
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
    () =>
      (this.timing() === 'scheduled' || this.closedMessage() === null) &&
      (this.timing() === 'asap' || (this.scheduledDate() !== '' && this.scheduledTime() !== '')) &&
      this.hasValidEmail() &&
      (this.fulfillmentType() === 'pickup' || this.deliveryAddress.result()?.within_radius === true),
  );

  constructor() {
    if (this.cart.lines().length === 0) {
      this.router.navigateByUrl('/');
      return;
    }

    // Juste pour l'aperçu affiché ici — le montant réellement facturé est toujours recalculé côté
    // serveur à la soumission (voir docblock de ShopCatalogController::index).
    this.shopService.getCatalog().subscribe({
      next: (catalog) => {
        this.deliveryFee.set(catalog.delivery_fee);
        this.deliveryAvailable.set(catalog.delivery_available);
        this.closedMessage.set(catalog.closed_message);
        this.openDays.set(catalog.open_days);
        this.openAt.set(catalog.open_at);
        this.closeAt.set(catalog.close_at);

        // Livraison désactivée entre-temps (réglage Paramètres) alors que "Livraison" était déjà
        // sélectionné (ex. onglet resté ouvert) — retombe sur "à emporter", seule option restante.
        if (!catalog.delivery_available && this.fulfillmentType() === 'delivery') {
          this.fulfillmentType.set('pickup');
        }

        // Fermé maintenant : "dès que possible" n'a pas de sens, bascule directement sur
        // "différé" plutôt que de laisser le client face à un bouton désactivé sans comprendre
        // pourquoi (le bandeau closedMessage() l'explique, mais autant agir dessus tout de suite).
        if (catalog.closed_message && this.timing() === 'asap') {
          this.setTiming('scheduled');
        }
      },
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

  setTiming(timing: FulfillmentTiming): void {
    this.timing.set(timing);

    if (timing === 'scheduled' && !this.scheduledDate()) {
      const first = this.availableDates()[0];
      if (first) this.selectDate(first.value);
    }
  }

  selectDate(value: string): void {
    this.scheduledDate.set(value);
    this.scheduledTime.set(this.timesFor(parseDateInputValue(value))[0] ?? '');
  }

  /** Créneaux de 15 min entre les horaires d'ouverture pour une date donnée — sans heures
   *  configurées (shop_open_at/close_at absents), toute la journée est proposée (aucune
   *  restriction, même principe que App\Support\ShopOpeningHours côté API). Exclut les créneaux
   *  déjà passés si `date` est aujourd'hui. */
  private timesFor(date: Date): string[] {
    const openAt = this.openAt() ?? '00:00';
    const closeAt = this.closeAt() ?? '23:45';
    const [openH, openM] = openAt.split(':').map(Number);
    const [closeH, closeM] = closeAt.split(':').map(Number);

    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), openH, openM);
    let end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), closeH, closeM);
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000); // fermeture après minuit

    const now = new Date();
    const isToday = toDateInputValue(date) === toDateInputValue(now);
    const slots: string[] = [];

    for (let t = new Date(start); t < end; t = new Date(t.getTime() + SLOT_MINUTES * 60_000)) {
      if (isToday && t <= now) continue;
      slots.push(`${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`);
    }

    return slots;
  }

  submit(): void {
    this.createCheckout((res) => {
      // Pas de cart.clear() ici : si le client revient en arrière depuis Stripe sans payer
      // (onglet fermé, navigation manuelle), le panier doit rester composé — seule une
      // confirmation de paiement réussie (pages/confirmation) justifie de le vider.
      // Non-null : checkout_url n'est null que si simulate=true a été envoyé (voir createCheckout).
      window.location.href = res.checkout_url!;
    });
  }

  /** Bouton de test (dev/test uniquement, voir isDevMode) : crée le même ShopCheckout qu'un
   *  paiement réel, mais avec simulate=true — le serveur ne crée alors aucune session Stripe
   *  (voir ShopCheckoutController::store) et on appelle directement ShopCheckoutController::simulate
   *  au lieu de rediriger vers Stripe. */
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
    }, true);
  }

  private createCheckout(onSuccess: (res: ShopCheckoutResponse) => void, simulate = false): void {
    if (this.cart.lines().length === 0 || this.submitting() || !this.canSubmit()) return;
    this.submitting.set(true);
    this.submitError.set(null);

    this.shopService
      .checkout({
        fulfillment_type: this.fulfillmentType(),
        fulfillment_timing: this.timing(),
        scheduled_at: this.timing() === 'scheduled' ? `${this.scheduledDate()} ${this.scheduledTime()}:00` : null,
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
        simulate,
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
