import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { ProductService } from '../../core/product.service';
import { ProductCatalogService } from '../../core/product-catalog.service';
import { PaymentMethodService } from '../../core/payment-method.service';
import { ClientService } from '../../core/client.service';
import { TicketService } from '../../core/ticket.service';
import { ActiveCashierService } from '../../core/active-cashier.service';
import { Product } from '../../core/models/product.model';
import { ProductCategory } from '../../core/models/catalog.model';
import { Client, PaymentMethod, Ticket } from '../../core/models/ticket.model';
import { TicketReceipt } from '../../shared/ticket-receipt/ticket-receipt';

interface CartLine {
  product: Product;
  quantity: number;
}

interface PaymentLine {
  method: PaymentMethod;
  value: number;
}

interface CategoryFilter {
  id: number | null;
  name: string;
  count: number;
}

/** Palette tournante pour les vignettes produit (pas de photo en base) — cohérent avec les
 *  icônes emoji déjà utilisées partout ailleurs dans l'app (sidebar, hub Paramètres). */
const PRODUCT_EMOJIS = ['🍽️', '🥗', '🍔', '🍰', '🥤', '🍕', '🍜', '🥐', '🍦', '🥙'];

@Component({
  selector: 'app-pos-vente',
  standalone: true,
  imports: [FormsModule, RouterLink, TicketReceipt],
  templateUrl: './pos-vente.html',
})
export class PosVente {
  private readonly productService = inject(ProductService);
  private readonly catalogService = inject(ProductCatalogService);
  private readonly paymentMethodService = inject(PaymentMethodService);
  private readonly clientService = inject(ClientService);
  private readonly ticketService = inject(TicketService);
  readonly activeCashierService = inject(ActiveCashierService);

  readonly allProducts = signal<Product[]>([]);
  readonly activeDirectSaleCatalogId = signal<number | null>(null);
  readonly paymentMethods = signal<PaymentMethod[]>([]);

  readonly searchTerm = signal('');
  readonly selectedCategoryId = signal<number | null>(null);

  readonly cart = signal<CartLine[]>([]);

  readonly clientSearch = signal('');
  readonly clientResults = signal<Client[]>([]);
  readonly selectedClient = signal<Client | null>(null);
  readonly showNewClientForm = signal(false);
  readonly newClientFirstname = signal('');
  readonly newClientLastname = signal('');
  readonly newClientPhone = signal('');
  readonly savingClient = signal(false);

  readonly paymentLines = signal<PaymentLine[]>([]);
  readonly showPaymentModal = signal(false);

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  /** Ticket payé affiché en plein écran après encaissement (voir order-builder.ts, même
   *  pattern) — reste posé le temps que le vendeur imprime, jusqu'à "Nouvelle vente". */
  readonly paidTicket = signal<Ticket | null>(null);

  private readonly clientSearch$ = new Subject<string>();

  /** Produits actifs rattachés au catalogue actif pour le POS Vente directe — indépendant du
   *  catalogue actif pour le POS Restaurant, voir ProductCatalog.active_direct_sale. */
  readonly availableProducts = computed(() => {
    const catalogId = this.activeDirectSaleCatalogId();
    if (catalogId === null) {
      return [];
    }

    return this.allProducts().filter(
      (product) => product.active && (product.catalogs ?? []).some((catalog) => catalog.id === catalogId),
    );
  });

  readonly categories = computed<CategoryFilter[]>(() => {
    const byId = new Map<number | null, CategoryFilter>();

    for (const product of this.availableProducts()) {
      const category: ProductCategory | null = product.category ?? null;
      const key = category?.id ?? null;
      const existing = byId.get(key);
      if (existing) {
        existing.count++;
      } else {
        byId.set(key, { id: key, name: category?.name ?? 'Sans catégorie', count: 1 });
      }
    }

    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly filteredProducts = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const categoryId = this.selectedCategoryId();

    return this.availableProducts().filter((product) => {
      const matchesCategory = categoryId === null || (product.category?.id ?? null) === categoryId;
      const matchesSearch = !term || product.name.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  });

  readonly cartTotal = computed(() =>
    this.cart().reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0),
  );

  /** Prix produit supposé TTC — la TVA affichée est extraite du prix, pas ajoutée dessus. */
  readonly vatTotal = computed(() =>
    this.cart().reduce((sum, line) => {
      const rate = Number(line.product.tax?.value ?? 0);
      if (rate <= 0) {
        return sum;
      }
      const lineTotal = Number(line.product.price) * line.quantity;
      return sum + (lineTotal - lineTotal / (1 + rate / 100));
    }, 0),
  );

  readonly paidTotal = computed(() => this.paymentLines().reduce((sum, line) => sum + line.value, 0));

  readonly remaining = computed(() => Math.round((this.cartTotal() - this.paidTotal()) * 100) / 100);

  readonly canSubmit = computed(
    () =>
      this.cart().length > 0 &&
      Math.abs(this.remaining()) < 0.005 &&
      !this.submitting() &&
      this.activeCashierService.activeSession() !== null,
  );

  constructor() {
    this.productService.list().subscribe((products) => this.allProducts.set(products));
    this.catalogService
      .list()
      .subscribe((catalogs) => this.activeDirectSaleCatalogId.set(catalogs.find((c) => c.active_direct_sale)?.id ?? null));
    this.paymentMethodService.list().subscribe((methods) => this.paymentMethods.set(methods));

    this.clientSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => this.clientService.search(query)),
      )
      .subscribe((results) => this.clientResults.set(results));
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

    this.resetPaymentsOnCartChange();
  }

  decrementCartLine(product: Product): void {
    const current = this.cart();
    const existing = current.find((line) => line.product.id === product.id);
    if (!existing) {
      return;
    }

    this.cart.set(
      existing.quantity <= 1
        ? current.filter((line) => line.product.id !== product.id)
        : current.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity - 1 } : line)),
    );

    this.resetPaymentsOnCartChange();
  }

  removeCartLine(product: Product): void {
    this.cart.set(this.cart().filter((line) => line.product.id !== product.id));
    this.resetPaymentsOnCartChange();
  }

  onClientSearchChange(value: string): void {
    this.clientSearch.set(value);
    if (value.trim().length >= 2) {
      this.clientSearch$.next(value.trim());
    } else {
      this.clientResults.set([]);
    }
  }

  selectClient(client: Client): void {
    this.selectedClient.set(client);
    this.clientSearch.set('');
    this.clientResults.set([]);
    this.showNewClientForm.set(false);
  }

  clearClient(): void {
    this.selectedClient.set(null);
  }

  toggleNewClientForm(): void {
    this.showNewClientForm.set(!this.showNewClientForm());
    this.clientResults.set([]);
  }

  submitNewClient(): void {
    if (!this.newClientFirstname().trim() || !this.newClientLastname().trim()) {
      return;
    }

    this.savingClient.set(true);
    this.clientService
      .create({
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

  /** Moyen de paiement en cours de saisie via le clavier visuel — null tant qu'aucune
   *  pastille "Espèces" n'a été choisie (affiche alors la liste des moyens plutôt que le
   *  clavier). Les autres moyens (Carte, Bancontact, Chèque-repas) s'ajoutent en un clic
   *  pour le montant dû, sans clavier — seul le cash peut donner lieu à un rendu. */
  readonly enteringMethod = signal<PaymentMethod | null>(null);
  readonly keypadBuffer = signal('');

  readonly keypadValue = computed(() => Number(this.keypadBuffer()) || 0);

  /** Rendu à donner si le montant tapé au clavier dépasse ce qu'il reste à payer. */
  readonly changeDue = computed(() => Math.max(this.keypadValue() - this.remaining(), 0));

  /** Part du montant tapé réellement affectée au ticket (jamais plus que ce qui est dû). */
  readonly appliedAmount = computed(() => Math.min(this.keypadValue(), this.remaining()));

  isCash(method: PaymentMethod): boolean {
    return method.slug === 'especes';
  }

  selectPaymentMethod(method: PaymentMethod): void {
    if (this.remaining() <= 0) {
      return;
    }

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
    if (digit === '.' && current.includes('.')) {
      return;
    }
    if (current.includes('.') && current.split('.')[1].length >= 2) {
      return;
    }

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
    if (!method || typed <= 0) {
      return;
    }

    // Le montant réellement affecté au ticket ne dépasse jamais ce qui est dû — le surplus
    // tapé (billet donné trop gros) reste un rendu affiché, pas une partie du paiement.
    const value = Math.min(typed, this.remaining());
    this.paymentLines.set([...this.paymentLines(), { method, value }]);
    this.enteringMethod.set(null);
    this.keypadBuffer.set('');
  }

  removePayment(index: number): void {
    this.paymentLines.set(this.paymentLines().filter((_, i) => i !== index));
  }

  clearSale(): void {
    this.cart.set([]);
    this.paymentLines.set([]);
    this.selectedClient.set(null);
    this.error.set(null);
  }

  openPaymentModal(): void {
    if (this.cart().length === 0) {
      return;
    }

    if (!this.activeCashierService.activeSession()) {
      this.error.set('Aucune caisse ouverte — ouvrez une caisse avant d\'encaisser.');
      return;
    }

    this.error.set(null);
    this.showPaymentModal.set(true);
  }

  closePaymentModal(): void {
    this.showPaymentModal.set(false);
    this.paymentLines.set([]);
    this.enteringMethod.set(null);
    this.keypadBuffer.set('');
    this.error.set(null);
  }

  submit(): void {
    if (!this.canSubmit()) {
      return;
    }

    this.error.set(null);
    this.submitting.set(true);

    this.ticketService
      .create({
        client_id: this.selectedClient()?.id ?? null,
        cash_session_id: this.activeCashierService.activeSession()?.id ?? null,
        lines: this.cart().map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
        payments: this.paymentLines().map((line) => ({ payment_method_id: line.method.id, value: line.value })),
      })
      .subscribe({
        next: (ticket: Ticket) => {
          this.submitting.set(false);
          this.showPaymentModal.set(false);
          this.paidTicket.set(ticket);
          this.clearSale();
        },
        error: (err) => {
          this.submitting.set(false);
          const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
          this.error.set(messages?.length ? messages.join(' ') : err.error?.message ?? "Impossible d'enregistrer la vente.");
        },
      });
  }

  printTicket(): void {
    window.print();
  }

  /** Referme l'écran de confirmation pour repartir sur une vente vide — clearSale() a déjà vidé
   *  panier/paiements/client au moment du paiement, il ne reste que paidTicket à effacer. */
  newSale(): void {
    this.paidTicket.set(null);
  }

  private resetPaymentsOnCartChange(): void {
    if (this.paymentLines().length > 0) {
      this.paymentLines.set([]);
    }
  }
}
