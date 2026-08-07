import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { KioskPaymentEchoService } from '../../core/kiosk-payment-echo.service';
import { KioskService } from '../../core/kiosk.service';
import { ProductStockEchoService } from '../../core/product-stock-echo.service';
import { Client, KioskCheckout, KioskCheckoutState, PaymentMethod, Product, Ticket, ValidateDiscountResponse } from '../../core/models/kiosk.model';
import { TicketReceipt } from '../../shared/ticket-receipt/ticket-receipt';

interface CartLine {
  product: Product;
  quantity: number;
}

interface CategoryFilter {
  id: number | null;
  name: string;
  count: number;
  /** Voir ProductCategory.icon/image_url — absents pour l'entrée "Tout" (id null, pas de vraie catégorie derrière). */
  icon: string | null;
  image_url: string | null;
}

type PaymentVariant = 'qr' | 'terminal';

const PRODUCT_EMOJIS = ['🍽️', '🥗', '🍔', '🍰', '🥤', '🍕', '🍜', '🥐', '🍦', '🥙'];

/** En dessous de ce nombre restant, le stock affiché passe en couleur d'alerte — purement
 *  visuel, n'affecte ni la commande ni le calcul. */
const LOW_STOCK_THRESHOLD = 3;

/**
 * Écran client du kiosque — "comme dans un fast food" (voir Readme du projet) : vente directe en
 * self-service, paiement immédiat au kiosque (contrairement au mode QR, qui n'encaisse jamais).
 * Catalogues utilisés : l'union de tous ceux marqués active_kiosk (voir
 * ProductCatalogController::setActiveForKiosk — plusieurs catalogues peuvent l'être à la fois),
 * indépendant des catalogues active_self_order utilisés par le mode QR — voir Paramètres >
 * Catalogue dans erp-app pour choisir quels catalogues sont actifs pour le kiosque.
 *
 * "Seulement deux moyens de paiement pour le kiosque : QR code ou terminal Bancontact" (retour
 * utilisateur) — pas d'espèces (kiosque non surveillé, pas de fond de caisse à gérer) ni de choix
 * multiple. Un seul moyen possible => pas de paiement fractionné, contrairement au POS d'erp-app.
 * Les deux variants divergent dans leur implémentation (voir choosePaymentVariant()) : "QR code"
 * est un vrai paiement Stripe Checkout, enregistré sous le payment_method "QR Code" — distinct de
 * "Bancontact" côté ERP pour pouvoir reconnaître/réconcilier séparément les deux dans les rapports
 * de caisse, même si les deux passent par Bancontact au sens du réseau bancaire (voir
 * startQrCheckout()/KioskCheckoutController), pendant que "Terminal"
 * reste entièrement simulé (voir confirmSimulatedPayment()/KioskOrderController) — un vrai
 * terminal Bancontact nécessiterait le SDK Stripe Terminal, hors périmètre pour l'instant.
 */
@Component({
  selector: 'app-kiosk-order',
  imports: [FormsModule, TicketReceipt],
  templateUrl: './kiosk-order.html',
  styleUrl: './kiosk-order.css',
})
export class KioskOrder implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly kioskService = inject(KioskService);
  private readonly kioskPaymentEcho = inject(KioskPaymentEchoService);
  private readonly productStockEcho = inject(ProductStockEchoService);
  private readonly router = inject(Router);

  /** Retour auto à "Nouvelle commande" 10s après le paiement — voir Readme.md. */
  private static readonly NEW_ORDER_DELAY_MS = 10000;
  private newOrderTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Filet de secours pour le paiement QR — voir docblock de kiosk-payment-echo.service.ts, un
   *  appareil kiosque n'est pas surveillé, ne pas dépendre uniquement du websocket. */
  private static readonly CHECKOUT_POLL_INTERVAL_MS = 3000;
  private checkoutPollHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Un seul abonnement pour toute la durée de vie du composant — kioskPaymentEcho ne relaie
    // jamais un event pour un checkout qui n'est plus activeCheckout() (voir listen(), qui quitte
    // toujours le canal précédent avant de s'abonner au suivant), donc pas besoin de filtrer par id
    // ici, juste de rafraîchir l'état depuis le serveur (source de vérité, jamais le payload de
    // l'event — voir refreshCheckoutStatus()).
    this.kioskPaymentEcho.events.pipe(takeUntilDestroyed()).subscribe(() => this.refreshCheckoutStatus());

    // Voir App\Events\ProductStockUpdated — grise/dégrise une tuile produit en direct (vente
    // depuis un autre poste, ou réapprovisionnement admin) sans recharger tout le menu.
    this.productStockEcho.listen();
    this.productStockEcho.stockUpdated.pipe(takeUntilDestroyed()).subscribe(({ productId, stockQuantity }) => {
      this.allProducts.set(
        this.allProducts().map((product) => (product.id === productId ? { ...product, stock_quantity: stockQuantity } : product)),
      );
    });
  }

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  private readonly allProducts = signal<Product[]>([]);
  /** Plusieurs catalogues peuvent être actifs à la fois pour le kiosque, voir
   *  ProductCatalog.active_kiosk. */
  private readonly activeCatalogIds = signal<number[]>([]);
  private readonly paymentMethods = signal<PaymentMethod[]>([]);
  private cashSessionId: number | null = null;

  readonly cart = signal<CartLine[]>([]);
  readonly selectedCategoryId = signal<number | null>(null);

  readonly showPaymentModal = signal(false);
  /** Aucun de ces deux "boutons" n'est un vrai moyen de paiement séparé — voir docblock de
   *  classe — juste quel écran de simulation afficher une fois choisi. */
  readonly simulatingVariant = signal<PaymentVariant | null>(null);
  readonly submitting = signal(false);
  readonly paymentError = signal<string | null>(null);
  readonly paidTicket = signal<Ticket | null>(null);

  /** Session Stripe Checkout en attente (variant QR — voir startQrCheckout()), null tant qu'elle
   *  n'a pas été créée/tant qu'on n'attend pas de paiement réel. */
  readonly activeCheckout = signal<KioskCheckout | null>(null);

  /** Code promo (voir DiscountCalculator côté API) — même pattern que pos-vente.ts/order-builder.ts. */
  readonly discountCodeInput = signal('');
  readonly appliedDiscount = signal<ValidateDiscountResponse | null>(null);
  readonly discountError = signal<string | null>(null);
  readonly checkingDiscount = signal(false);

  /** "Connexion" client optionnelle (voir Readme.md — programme de fidélité), absente du kiosque
   *  jusqu'ici (client_id était toujours envoyé à null). Contrairement à pos-vente.ts (recherche
   *  libre + liste, outil interne staff), le kiosque est un appareil public : pas de liste
   *  affichant les noms d'autres clients, juste une correspondance exacte par téléphone (voir
   *  KioskService::lookupClientByPhone) — trouvé -> sélectionné directement, sinon -> proposition
   *  de créer un compte avec ce numéro. */
  readonly clientPhoneInput = signal('');
  readonly lookingUpClient = signal(false);
  readonly clientLookupError = signal<string | null>(null);
  readonly selectedClient = signal<Client | null>(null);
  readonly showNewClientForm = signal(false);
  readonly newClientFirstname = signal('');
  readonly newClientLastname = signal('');
  readonly newClientPhone = signal('');
  readonly savingClient = signal(false);

  /** Points fidélité à utiliser en réduction (voir App\Support\LoyaltyPoints côté API) — même
   *  pattern que pos-vente.ts::setPointsToRedeem. */
  readonly pointsToRedeemInput = signal(0);

  /** Variant "Terminal" (simulé, voir confirmSimulatedPayment()). */
  readonly bancontactMethod = computed(() => this.paymentMethods().find((method) => method.slug === 'bancontact') ?? null);
  /** Variant "QR code" (paiement Stripe réel, voir startQrCheckout()) — distinct de Bancontact
   *  côté ERP pour pouvoir reconnaître/réconcilier séparément les deux variants dans les rapports
   *  de caisse (voir StripeWebhookController::markPaid côté API), même si les deux passent par
   *  Bancontact au sens du réseau bancaire. */
  readonly qrCodeMethod = computed(() => this.paymentMethods().find((method) => method.slug === 'qr-code') ?? null);

  readonly availableProducts = computed(() => {
    const catalogIds = this.activeCatalogIds();
    if (catalogIds.length === 0) return [];
    return this.allProducts().filter((product) => product.active && (product.catalogs ?? []).some((catalog) => catalogIds.includes(catalog.id)));
  });

  readonly categories = computed<CategoryFilter[]>(() => {
    const byId = new Map<number | null, CategoryFilter>();
    for (const product of this.availableProducts()) {
      const category = product.category ?? null;
      const key = category?.id ?? null;
      const existing = byId.get(key);
      if (existing) existing.count++;
      else byId.set(key, { id: key, name: category?.name ?? 'Autres', count: 1, icon: category?.icon ?? null, image_url: category?.image_url ?? null });
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly filteredProducts = computed(() => {
    const categoryId = this.selectedCategoryId();
    return this.availableProducts().filter((product) => categoryId === null || (product.category?.id ?? null) === categoryId);
  });

  readonly cartTotal = computed(() => this.cart().reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0));

  readonly discountAmount = computed(() => this.appliedDiscount()?.amount_off ?? 0);

  /** Conversion fixe points→€ (100 points = 5€, voir App\Support\LoyaltyPoints::EUR_PER_POINT
   *  côté API) — même pattern que pos-vente.ts. */
  readonly pointsAmount = computed(() => Math.round(this.pointsToRedeemInput() * 0.05 * 100) / 100);

  /** Total réellement dû après réduction (promo ET points, cumulables) — le serveur recalcule
   *  indépendamment au moment du paiement (voir KioskOrderController::store) ; ceci ne sert qu'à
   *  l'affichage. */
  readonly payableTotal = computed(() =>
    Math.max(Math.round((this.cartTotal() - this.discountAmount() - this.pointsAmount()) * 100) / 100, 0),
  );

  ngOnInit(): void {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;

    forkJoin({
      products: this.kioskService.listProducts(),
      catalogs: this.kioskService.listCatalogs(),
      paymentMethods: this.kioskService.listPaymentMethods(),
      session: this.kioskService.activeCashSession(userId),
    }).subscribe({
      next: ({ products, catalogs, paymentMethods, session }) => {
        if (!session) {
          this.router.navigateByUrl('/setup');
          return;
        }
        this.cashSessionId = session.id;
        this.allProducts.set(products);
        this.paymentMethods.set(paymentMethods);
        this.activeCatalogIds.set(catalogs.filter((catalog) => catalog.active_kiosk).map((catalog) => catalog.id));
        this.loading.set(false);
        if (this.activeCatalogIds().length === 0) {
          this.loadError.set('Aucun catalogue disponible pour le moment — contactez le personnel.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Impossible de charger le menu — réessayez dans un instant.');
      },
    });
  }

  productEmoji(product: Product): string {
    const categoryId = product.category?.id ?? product.id;
    return PRODUCT_EMOJIS[categoryId % PRODUCT_EMOJIS.length];
  }

  /** Icône de la sidebar catégories — même logique que productEmoji() (stable par id), 🍽️ pour
   *  "Tout"/catégories sans id ("Autres"), pour rester cohérent visuellement avec les vignettes
   *  produit de la même catégorie. */
  categoryEmoji(categoryId: number | null): string {
    return categoryId === null ? '🍽️' : PRODUCT_EMOJIS[categoryId % PRODUCT_EMOJIS.length];
  }

  formatMoney(value: number | string): string {
    return Number(value).toFixed(2) + ' €';
  }

  lineTotal(line: CartLine): number {
    return Number(line.product.price) * line.quantity;
  }

  quantityInCart(product: Product): number {
    return this.cart().find((line) => line.product.id === product.id)?.quantity ?? 0;
  }

  /** `null` = stock non suivi, jamais affiché/décompté — voir pos-vente.ts côté erp-app, même
   *  principe. Mis à jour en temps réel par ProductStockEchoService (voir constructor()) à
   *  chaque vente ou réapprovisionnement, sur ce kiosque comme sur n'importe quel autre poste. */
  remainingStock(product: Product): number | null {
    return product.stock_quantity === null ? null : product.stock_quantity - this.quantityInCart(product);
  }

  isOutOfStock(product: Product): boolean {
    const remaining = this.remainingStock(product);
    return remaining !== null && remaining <= 0;
  }

  /** Repère visuel (couleur d'alerte) en dessous de ce seuil — purement visuel. */
  isLowStock(product: Product): boolean {
    const remaining = this.remainingStock(product);
    return remaining !== null && remaining > 0 && remaining <= LOW_STOCK_THRESHOLD;
  }

  addToCart(product: Product): void {
    if (this.isOutOfStock(product)) {
      return;
    }

    const current = this.cart();
    const existing = current.find((line) => line.product.id === product.id);
    if (existing) {
      this.cart.set(current.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)));
    } else {
      this.cart.set([...current, { product, quantity: 1 }]);
    }
  }

  decrementCartLine(product: Product): void {
    const current = this.cart();
    const existing = current.find((line) => line.product.id === product.id);
    if (!existing) return;
    this.cart.set(
      existing.quantity <= 1
        ? current.filter((line) => line.product.id !== product.id)
        : current.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity - 1 } : line)),
    );
  }

  removeCartLine(product: Product): void {
    this.cart.set(this.cart().filter((line) => line.product.id !== product.id));
  }

  openPaymentModal(): void {
    if (this.cart().length === 0) return;
    this.paymentError.set(null);
    this.showPaymentModal.set(true);
  }

  closePaymentModal(): void {
    this.stopWaitingForPayment();
    this.showPaymentModal.set(false);
    this.simulatingVariant.set(null);
    this.paymentError.set(null);
    this.appliedDiscount.set(null);
    this.discountCodeInput.set('');
    this.discountError.set(null);
    this.clearClient();
  }

  applyDiscountCode(): void {
    const code = this.discountCodeInput().trim().toUpperCase();
    if (!code || this.checkingDiscount()) {
      return;
    }

    this.checkingDiscount.set(true);
    this.discountError.set(null);

    this.kioskService
      .validateDiscount(
        code,
        this.cart().map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
      )
      .subscribe({
        next: (result) => {
          this.checkingDiscount.set(false);
          this.appliedDiscount.set(result);
        },
        error: (err) => {
          this.checkingDiscount.set(false);
          this.appliedDiscount.set(null);
          const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
          this.discountError.set((messages?.length ? messages.join(' ') : err.error?.message) ?? 'Code invalide.');
        },
      });
  }

  removeDiscount(): void {
    this.appliedDiscount.set(null);
    this.discountCodeInput.set('');
    this.discountError.set(null);
  }

  // --- Client ("connexion" par téléphone, voir docblock du signal clientPhoneInput) ---

  lookupClient(): void {
    const phone = this.clientPhoneInput().trim();
    if (!phone || this.lookingUpClient()) {
      return;
    }

    this.lookingUpClient.set(true);
    this.clientLookupError.set(null);

    this.kioskService.lookupClientByPhone(phone).subscribe({
      next: (client) => {
        this.lookingUpClient.set(false);
        if (client) {
          this.selectClient(client);
        } else {
          // Création de compte désactivée pour l'instant sur le kiosque (retour utilisateur) —
          // simple message, plus d'ouverture auto du formulaire (voir kiosk-order.html).
          this.clientLookupError.set('Aucun client trouvé avec ce numéro.');
        }
      },
      error: () => {
        this.lookingUpClient.set(false);
        this.clientLookupError.set('Impossible de rechercher ce numéro — réessayez.');
      },
    });
  }

  selectClient(client: Client): void {
    this.selectedClient.set(client);
    this.clientPhoneInput.set('');
    this.clientLookupError.set(null);
    this.showNewClientForm.set(false);
    this.pointsToRedeemInput.set(0);
  }

  clearClient(): void {
    this.selectedClient.set(null);
    this.pointsToRedeemInput.set(0);
    this.clientPhoneInput.set('');
    this.clientLookupError.set(null);
    this.showNewClientForm.set(false);
  }

  toggleNewClientForm(): void {
    this.showNewClientForm.set(!this.showNewClientForm());
  }

  submitNewClient(): void {
    if (!this.newClientFirstname().trim() || !this.newClientLastname().trim()) {
      return;
    }

    this.savingClient.set(true);
    this.kioskService
      .createClient({
        firstname: this.newClientFirstname().trim(),
        lastname: this.newClientLastname().trim(),
        phone: this.newClientPhone().trim() || undefined,
      })
      .subscribe({
        next: (client) => {
          this.savingClient.set(false);
          this.newClientFirstname.set('');
          this.newClientLastname.set('');
          this.newClientPhone.set('');
          this.selectClient(client);
        },
        error: () => this.savingClient.set(false),
      });
  }

  /** Plafonne la saisie au solde du client sélectionné — le serveur revalide de toute façon
   *  (voir App\Support\LoyaltyPoints::amountOff côté API). */
  setPointsToRedeem(value: number): void {
    const balance = this.selectedClient()?.points_balance ?? 0;
    this.pointsToRedeemInput.set(Math.max(0, Math.min(Math.floor(value) || 0, balance)));
  }

  choosePaymentVariant(variant: PaymentVariant): void {
    if (variant === 'qr' && !this.qrCodeMethod()) {
      this.paymentError.set('Aucun moyen de paiement QR Code configuré — contactez le personnel.');
      return;
    }
    if (variant === 'terminal' && !this.bancontactMethod()) {
      this.paymentError.set('Aucun moyen de paiement Bancontact configuré — contactez le personnel.');
      return;
    }
    this.paymentError.set(null);
    this.simulatingVariant.set(variant);
    if (variant === 'qr') {
      this.startQrCheckout();
    }
  }

  cancelSimulatedPayment(): void {
    this.stopWaitingForPayment();
    this.simulatingVariant.set(null);
  }

  /** Crée la session Stripe Checkout (voir KioskCheckoutController) et affiche son QR — le
   *  paiement lui-même se passe sur le téléphone du client, hors de cet écran (voir
   *  refreshCheckoutStatus()/kioskPaymentEcho pour la suite, contrairement au variant terminal qui
   *  reste, lui, entièrement simulé sur ce même écran). */
  private startQrCheckout(): void {
    this.activeCheckout.set(null);

    this.kioskService
      .createKioskCheckout({
        client_id: this.selectedClient()?.id ?? null,
        cash_session_id: this.cashSessionId,
        discount_code: this.appliedDiscount()?.discount.code ?? null,
        points_redeemed: this.pointsToRedeemInput() > 0 ? this.pointsToRedeemInput() : null,
        lines: this.cart().map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
      })
      .subscribe({
        next: (checkout) => {
          this.activeCheckout.set(checkout);
          this.kioskPaymentEcho.listen(checkout.id);
          this.checkoutPollHandle = setInterval(() => this.refreshCheckoutStatus(), KioskOrder.CHECKOUT_POLL_INTERVAL_MS);
        },
        error: (err) => {
          this.simulatingVariant.set(null);
          const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
          this.paymentError.set((messages?.length ? messages.join(' ') : err.error?.message) ?? 'Impossible de générer le QR code.');
        },
      });
  }

  /** Source de vérité unique pour l'état d'un checkout en attente — appelée à la fois par le
   *  polling de secours et par le handler des events temps réel (voir constructor()) : jamais de
   *  confiance dans le payload d'un event, toujours un GET frais (voir docblock de
   *  KioskCheckoutPaid côté API, même principe que le reste de l'app : refetch après mutation). */
  private refreshCheckoutStatus(): void {
    const checkout = this.activeCheckout();
    if (!checkout) return;

    this.kioskService.getKioskCheckout(checkout.id).subscribe({
      next: (state) => this.applyCheckoutState(checkout.id, state),
      // Hoquet réseau transitoire — le prochain tick de polling (ou le prochain event) réessaiera.
      error: () => {},
    });
  }

  private applyCheckoutState(checkoutId: number, state: KioskCheckoutState): void {
    // Le checkout a été annulé/remplacé entre le déclenchement de la requête et sa réponse (ex.
    // "← Retour" cliqué entre-temps) — une réponse en retard ne doit plus rien changer à l'écran.
    if (this.activeCheckout()?.id !== checkoutId) return;

    if (state.status === 'paid' && state.ticket) {
      // closePaymentModal() appelle déjà stopWaitingForPayment() — voir sa définition.
      this.closePaymentModal();
      this.cart.set([]);
      this.paidTicket.set(state.ticket);
      this.newOrderTimeout = setTimeout(() => this.newOrder(), KioskOrder.NEW_ORDER_DELAY_MS);
    } else if (state.status === 'failed' || state.status === 'expired') {
      this.stopWaitingForPayment();
      this.simulatingVariant.set(null);
      this.paymentError.set('Le paiement a échoué ou le QR code a expiré — réessayez.');
    }
    // 'pending' : rien à faire, on continue d'attendre (prochain event ou prochain tick de polling).
  }

  private stopWaitingForPayment(): void {
    this.kioskPaymentEcho.stopListening();
    if (this.checkoutPollHandle !== null) {
      clearInterval(this.checkoutPollHandle);
      this.checkoutPollHandle = null;
    }
    this.activeCheckout.set(null);
  }

  terminalMessage(variant: PaymentVariant): string {
    return variant === 'qr'
      ? 'Scannez le QR code Bancontact avec votre application bancaire.'
      : 'Présentez ou insérez votre carte Bancontact sur le terminal.';
  }

  /** Valide la simulation ET encaisse dans la foulée — un seul moyen possible, pas de paiement
   *  fractionné à composer avant de "Valider" (voir docblock de classe). */
  confirmSimulatedPayment(): void {
    const method = this.bancontactMethod();
    if (!method || this.submitting()) return;

    this.submitting.set(true);
    this.paymentError.set(null);

    this.kioskService
      .createKioskOrder({
        client_id: this.selectedClient()?.id ?? null,
        cash_session_id: this.cashSessionId,
        discount_code: this.appliedDiscount()?.discount.code ?? null,
        points_redeemed: this.pointsToRedeemInput() > 0 ? this.pointsToRedeemInput() : null,
        lines: this.cart().map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
        payments: [{ payment_method_id: method.id, value: this.payableTotal() }],
      })
      .subscribe({
        next: (ticket) => {
          this.submitting.set(false);
          this.closePaymentModal();
          this.cart.set([]);
          this.paidTicket.set(ticket);
          this.newOrderTimeout = setTimeout(() => this.newOrder(), KioskOrder.NEW_ORDER_DELAY_MS);
        },
        error: (err) => {
          this.submitting.set(false);
          const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
          this.paymentError.set((messages?.length ? messages.join(' ') : err.error?.message) ?? "Impossible d'enregistrer la vente.");
        },
      });
  }

  printTicket(): void {
    window.print();
  }

  /** Le client suivant repart d'un panier vide — déclenché soit manuellement, soit
   *  automatiquement 5s après le paiement (voir confirmSimulatedPayment()). Annule le timer dans
   *  les deux cas : un clic manuel avant l'échéance ne doit pas redéclencher un second reset
   *  derrière. */
  newOrder(): void {
    if (this.newOrderTimeout !== null) {
      clearTimeout(this.newOrderTimeout);
      this.newOrderTimeout = null;
    }
    this.paidTicket.set(null);
    this.appliedDiscount.set(null);
    this.discountCodeInput.set('');
    this.discountError.set(null);
  }

  goToSetup(): void {
    this.router.navigateByUrl('/setup');
  }

  ngOnDestroy(): void {
    if (this.newOrderTimeout !== null) {
      clearTimeout(this.newOrderTimeout);
    }
    // kioskPaymentEcho est fourni en root (singleton) — sans ça, un checkout resterait
    // "écouté" côté websocket même après avoir quitté cet écran (ex. goToSetup()).
    this.stopWaitingForPayment();
  }
}
