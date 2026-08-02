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

interface PaymentLine {
  method: PaymentMethod;
  value: number;
}

const PRODUCT_EMOJIS = ['🍽️', '🥗', '🍔', '🍰', '🥤', '🍕', '🍜', '🥐', '🍦', '🥙'];

/**
 * Écran client du kiosque — "comme dans un fast food" (voir Readme du projet) : vente directe en
 * self-service, paiement immédiat au kiosque (contrairement au mode QR, qui n'encaisse jamais).
 * Catalogue utilisé : celui marqué active_self_order (même source que le mode QR, voir
 * ProductCatalogController::activateForSelfOrder) — pas active_direct_sale, pour que le contenu du
 * kiosque et du menu QR restent toujours identiques. Encaissement via POST /tickets, exactement
 * comme erp-app > POS Vente directe, rattaché à la session de caisse ouverte par le membre du
 * personnel qui a configuré ce kiosque (voir kiosk-setup).
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
  private cashSessionId: number | null = null;

  readonly cart = signal<CartLine[]>([]);
  readonly selectedCategoryId = signal<number | null>(null);

  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly showPaymentModal = signal(false);
  readonly paymentLines = signal<PaymentLine[]>([]);
  readonly enteringMethod = signal<PaymentMethod | null>(null);
  readonly keypadBuffer = signal('');
  readonly submitting = signal(false);
  readonly paymentError = signal<string | null>(null);
  readonly paidTicket = signal<Ticket | null>(null);

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

  readonly keypadValue = computed(() => Number(this.keypadBuffer()) || 0);
  readonly paidTotal = computed(() => this.paymentLines().reduce((sum, line) => sum + line.value, 0));
  readonly remaining = computed(() => Math.round((this.cartTotal() - this.paidTotal()) * 100) / 100);
  readonly changeDue = computed(() => Math.max(this.keypadValue() - this.remaining(), 0));

  readonly canSubmit = computed(() => this.cart().length > 0 && Math.abs(this.remaining()) < 0.005 && !this.submitting());

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
          this.router.navigateByUrl('/kiosk/setup');
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
    this.resetPayments();
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
    this.resetPayments();
  }

  removeCartLine(product: Product): void {
    this.cart.set(this.cart().filter((line) => line.product.id !== product.id));
    this.resetPayments();
  }

  private resetPayments(): void {
    if (this.paymentLines().length > 0) this.paymentLines.set([]);
  }

  openPaymentModal(): void {
    if (this.cart().length === 0) return;
    this.paymentError.set(null);
    this.showPaymentModal.set(true);
  }

  closePaymentModal(): void {
    this.showPaymentModal.set(false);
    this.paymentLines.set([]);
    this.enteringMethod.set(null);
    this.keypadBuffer.set('');
    this.paymentError.set(null);
  }

  isCash(method: PaymentMethod): boolean {
    return method.slug === 'especes';
  }

  selectPaymentMethod(method: PaymentMethod): void {
    if (this.remaining() <= 0) return;
    if (!this.isCash(method)) {
      this.paymentLines.set([...this.paymentLines(), { method, value: this.remaining() }]);
      return;
    }
    this.enteringMethod.set(method);
    this.keypadBuffer.set('');
  }

  cancelPaymentEntry(): void {
    this.enteringMethod.set(null);
    this.keypadBuffer.set('');
  }

  pressDigit(digit: string): void {
    const current = this.keypadBuffer();
    if (digit === '.' && current.includes('.')) return;
    if (current.includes('.') && current.split('.')[1].length >= 2) return;
    this.keypadBuffer.set(current === '0' && digit !== '.' ? digit : current + digit);
  }

  backspace(): void {
    this.keypadBuffer.set(this.keypadBuffer().slice(0, -1));
  }

  setQuickAmount(value: number): void {
    this.keypadBuffer.set(value.toFixed(2));
  }

  setExactRemaining(): void {
    this.keypadBuffer.set(Math.max(this.remaining(), 0).toFixed(2));
  }

  confirmPaymentEntry(): void {
    const method = this.enteringMethod();
    const typed = this.keypadValue();
    if (!method || typed <= 0) return;
    const value = Math.min(typed, this.remaining());
    this.paymentLines.set([...this.paymentLines(), { method, value }]);
    this.enteringMethod.set(null);
    this.keypadBuffer.set('');
  }

  removePayment(index: number): void {
    this.paymentLines.set(this.paymentLines().filter((_, i) => i !== index));
  }

  submit(): void {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.paymentError.set(null);

    this.kioskService
      .createKioskOrder({
        client_id: null,
        cash_session_id: this.cashSessionId,
        lines: this.cart().map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
        payments: this.paymentLines().map((line) => ({ payment_method_id: line.method.id, value: line.value })),
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
   *  automatiquement 5s après le paiement (voir submit()). Annule le timer dans les deux cas :
   *  un clic manuel avant l'échéance ne doit pas redéclencher un second reset derrière. */
  newOrder(): void {
    if (this.newOrderTimeout !== null) {
      clearTimeout(this.newOrderTimeout);
      this.newOrderTimeout = null;
    }
    this.paidTicket.set(null);
  }

  goToSetup(): void {
    this.router.navigateByUrl('/kiosk/setup');
  }

  ngOnDestroy(): void {
    if (this.newOrderTimeout !== null) {
      clearTimeout(this.newOrderTimeout);
    }
  }
}
