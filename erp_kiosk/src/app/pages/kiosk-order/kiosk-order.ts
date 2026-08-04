import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { KioskService } from '../../core/kiosk.service';
import { PaymentMethod, Product, Ticket } from '../../core/models/kiosk.model';
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
 * Catalogue utilisé : celui marqué active_self_order (même source que le mode QR, voir
 * ProductCatalogController::activateForSelfOrder) — pas active_direct_sale, pour que le contenu du
 * kiosque et du menu QR restent toujours identiques.
 *
 * "Seulement deux moyens de paiement pour le kiosque : QR code ou terminal Bancontact" (retour
 * utilisateur) — pas d'espèces (kiosque non surveillé, pas de fond de caisse à gérer) ni de choix
 * multiple : les deux options renvoient au même payment_method "Bancontact" (aucune distinction
 * n'existe côté ERP entre payer par carte au terminal ou en scannant un QR avec l'app
 * Bancontact — ce n'est qu'une différence d'écran de simulation, voir choosePaymentVariant()).
 * Un seul moyen possible => pas de paiement fractionné, contrairement au POS d'erp-app.
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
  private readonly router = inject(Router);

  /** Retour auto à "Nouvelle commande" 5s après le paiement — voir Readme.md. */
  private static readonly NEW_ORDER_DELAY_MS = 5000;
  private newOrderTimeout: ReturnType<typeof setTimeout> | null = null;

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

  readonly bancontactMethod = computed(() => this.paymentMethods().find((method) => method.slug === 'bancontact') ?? null);

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
        this.activeCatalogId.set(catalogs.find((catalog) => catalog.active_self_order)?.id ?? null);
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
    this.showPaymentModal.set(false);
    this.simulatingVariant.set(null);
    this.paymentError.set(null);
  }

  choosePaymentVariant(variant: PaymentVariant): void {
    if (!this.bancontactMethod()) {
      this.paymentError.set('Aucun moyen de paiement Bancontact configuré — contactez le personnel.');
      return;
    }
    this.paymentError.set(null);
    this.simulatingVariant.set(variant);
  }

  cancelSimulatedPayment(): void {
    this.simulatingVariant.set(null);
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
        lines: this.cart().map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
        payments: [{ payment_method_id: method.id, value: this.cartTotal() }],
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
  }

  goToSetup(): void {
    this.router.navigateByUrl('/setup');
  }

  ngOnDestroy(): void {
    if (this.newOrderTimeout !== null) {
      clearTimeout(this.newOrderTimeout);
    }
  }
}
