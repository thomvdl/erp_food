import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { KioskPaymentEchoService } from '../../core/kiosk-payment-echo.service';
import { KioskService } from '../../core/kiosk.service';
import { KioskCheckout, KioskCheckoutState, PaymentMethod, Product, Ticket, ValidateDiscountResponse } from '../../core/models/kiosk.model';
import { TicketReceipt } from '../../shared/ticket-receipt/ticket-receipt';

interface CartLine {
  product: Product;
  quantity: number;
}

interface CategoryFilter {
  id: number | null;
  name: string;
  count: number;
}

type PaymentVariant = 'qr' | 'terminal';

const PRODUCT_EMOJIS = ['🍽️', '🥗', '🍔', '🍰', '🥤', '🍕', '🍜', '🥐', '🍦', '🥙'];

/**
 * Écran client du kiosque — "comme dans un fast food" (voir Readme du projet) : vente directe en
 * self-service, paiement immédiat au kiosque (contrairement au mode QR, qui n'encaisse jamais).
 * Catalogue utilisé : celui marqué active_kiosk (voir ProductCatalogController::activateForKiosk),
 * indépendant du catalogue active_self_order utilisé par le mode QR — voir Paramètres > Catalogue
 * dans erp-app pour choisir quel catalogue est actif pour le kiosque.
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
  }

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  private readonly allProducts = signal<Product[]>([]);
  private readonly activeCatalogId = signal<number | null>(null);
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

  /** Variant "Terminal" (simulé, voir confirmSimulatedPayment()). */
  readonly bancontactMethod = computed(() => this.paymentMethods().find((method) => method.slug === 'bancontact') ?? null);
  /** Variant "QR code" (paiement Stripe réel, voir startQrCheckout()) — distinct de Bancontact
   *  côté ERP pour pouvoir reconnaître/réconcilier séparément les deux variants dans les rapports
   *  de caisse (voir StripeWebhookController::markPaid côté API), même si les deux passent par
   *  Bancontact au sens du réseau bancaire. */
  readonly qrCodeMethod = computed(() => this.paymentMethods().find((method) => method.slug === 'qr-code') ?? null);

  readonly availableProducts = computed(() => {
    const catalogId = this.activeCatalogId();
    if (catalogId === null) return [];
    return this.allProducts().filter((product) => product.active && (product.catalogs ?? []).some((catalog) => catalog.id === catalogId));
  });

  readonly categories = computed<CategoryFilter[]>(() => {
    const byId = new Map<number | null, CategoryFilter>();
    for (const product of this.availableProducts()) {
      const category = product.category ?? null;
      const key = category?.id ?? null;
      const existing = byId.get(key);
      if (existing) existing.count++;
      else byId.set(key, { id: key, name: category?.name ?? 'Autres', count: 1 });
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly filteredProducts = computed(() => {
    const categoryId = this.selectedCategoryId();
    return this.availableProducts().filter((product) => categoryId === null || (product.category?.id ?? null) === categoryId);
  });

  readonly cartTotal = computed(() => this.cart().reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0));

  readonly discountAmount = computed(() => this.appliedDiscount()?.amount_off ?? 0);
  /** Total réellement dû après réduction — le serveur recalcule indépendamment au moment du
   *  paiement (voir KioskOrderController::store) ; ceci ne sert qu'à l'affichage. */
  readonly payableTotal = computed(() => Math.max(Math.round((this.cartTotal() - this.discountAmount()) * 100) / 100, 0));

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
        this.activeCatalogId.set(catalogs.find((catalog) => catalog.active_kiosk)?.id ?? null);
        this.loading.set(false);
        if (this.activeCatalogId() === null) {
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

  addToCart(product: Product): void {
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
        client_id: null,
        cash_session_id: this.cashSessionId,
        discount_code: this.appliedDiscount()?.discount.code ?? null,
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
        client_id: null,
        cash_session_id: this.cashSessionId,
        discount_code: this.appliedDiscount()?.discount.code ?? null,
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
