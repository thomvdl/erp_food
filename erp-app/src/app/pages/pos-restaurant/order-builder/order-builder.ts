import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth.service';
import { OrderService } from '../../../core/order.service';
import { OrderSectionService } from '../../../core/order-section.service';
import { OrderLineService } from '../../../core/order-line.service';
import { ProductService } from '../../../core/product.service';
import { ProductCatalogService } from '../../../core/product-catalog.service';
import { PaymentMethodService } from '../../../core/payment-method.service';
import { ClientService } from '../../../core/client.service';
import { TicketService } from '../../../core/ticket.service';
import { DiscountService } from '../../../core/discount.service';
import { ActiveCashierService } from '../../../core/active-cashier.service';
import { RoomService } from '../../../core/room.service';
import { Order, OrderLine, OrderSection } from '../../../core/models/order.model';
import { Product } from '../../../core/models/product.model';
import { ProductCategory } from '../../../core/models/catalog.model';
import { Room, TableElement } from '../../../core/models/floor-plan.model';
import { Client, PaymentMethod, Ticket } from '../../../core/models/ticket.model';
import { ValidateDiscountResponse } from '../../../core/models/discount.model';
import { KitchenEchoService } from '../../../core/kitchen-echo.service';
import { formatMoney } from '../../../core/ticket-print.util';
import { TicketReceipt } from '../../../shared/ticket-receipt/ticket-receipt';
import { computeFitScale } from '../../../core/utils/fit-scale';

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
 * Sélection de produits d'une table ouverte, répartis en sections (voir Readme.md :
 * "Séparer les produits en sections, pouvoir ajouter des sections"). Chaque action (ajouter un
 * produit, une section, changer une quantité) persiste immédiatement côté backend puis
 * rafraîchit toute la commande — pas de "brouillon" local à sauvegarder plus tard, cohérent avec
 * le reste de l'app (fond de caisse, réservations...).
 */
@Component({
  selector: 'app-order-builder',
  standalone: true,
  imports: [FormsModule, RouterLink, TicketReceipt],
  templateUrl: './order-builder.html',
  styleUrl: './order-builder.css',
})
export class OrderBuilder implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orderService = inject(OrderService);
  private readonly orderSectionService = inject(OrderSectionService);
  private readonly orderLineService = inject(OrderLineService);
  private readonly productService = inject(ProductService);
  private readonly catalogService = inject(ProductCatalogService);
  private readonly paymentMethodService = inject(PaymentMethodService);
  private readonly clientService = inject(ClientService);
  private readonly ticketService = inject(TicketService);
  private readonly discountService = inject(DiscountService);
  readonly activeCashierService = inject(ActiveCashierService);
  readonly authService = inject(AuthService);
  private readonly kitchenEcho = inject(KitchenEchoService);
  private readonly roomService = inject(RoomService);

  private readonly orderId = Number(this.route.snapshot.paramMap.get('orderId'));

  readonly order = signal<Order | null>(null);
  readonly loading = signal(true);
  readonly activeSectionId = signal<number | null>(null);

  readonly allProducts = signal<Product[]>([]);
  readonly activeRestaurantCatalogId = signal<number | null>(null);

  readonly searchTerm = signal('');
  readonly selectedCategoryId = signal<number | null>(null);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  // --- Note produit (ex. "sans oignon", "bien cuit") — édition sur une ligne déjà dans le panier
  // plutôt qu'à l'ajout, pour ne pas ralentir la saisie rapide (voir addProduct). ---
  readonly editingNoteLineId = signal<number | null>(null);
  readonly noteDraft = signal('');

  // --- Correction ("un produit en trop", voir Readme.md/OrderController::correction) — une
  // fois toutes les sections envoyées en cuisine, plus possible de simplement supprimer une
  // ligne (verrouillée) : cette modale ajoute une ligne compensatoire en négatif à la place. ---
  readonly showCorrectionModal = signal(false);
  readonly correctionQuantities = signal<Record<number, number>>({});
  readonly correcting = signal(false);
  readonly correctionError = signal<string | null>(null);

  /** Quantité nette (déjà éventuellement corrigée) par produit, tous produits confondus dans la
   *  commande — seuls ceux encore net positif ont un sens à corriger. */
  readonly correctableLines = computed(() => {
    const byProduct = new Map<number, { product_id: number; name: string; netQuantity: number }>();
    for (const section of this.sections()) {
      for (const line of section.lines) {
        const delta = line.is_correction ? -line.quantity : line.quantity;
        const existing = byProduct.get(line.product_id);
        if (existing) {
          existing.netQuantity += delta;
        } else {
          byProduct.set(line.product_id, { product_id: line.product_id, name: line.product?.name ?? '—', netQuantity: delta });
        }
      }
    }
    return Array.from(byProduct.values()).filter((entry) => entry.netQuantity > 0);
  });

  readonly hasCorrectionsToSubmit = computed(() => Object.values(this.correctionQuantities()).some((qty) => qty > 0));

  // --- Transfert de table ("le client change de place") — même pattern de plan de salle en
  // lecture seule que table-select.ts, mais dans une modale plutôt qu'un écran plein. ---
  readonly showTransferModal = signal(false);
  readonly transferRooms = signal<Room[]>([]);
  readonly transferSelectedRoomId = signal<number | null>(null);
  readonly transferOrders = signal<Order[]>([]);
  readonly transferring = signal(false);
  readonly transferError = signal<string | null>(null);

  readonly transferRestaurantRooms = computed(() => this.transferRooms().filter((room) => room.type === 'restaurant' && room.active));
  readonly transferSelectedRoom = computed(
    () => this.transferRestaurantRooms().find((room) => room.id === this.transferSelectedRoomId()) ?? null,
  );
  /** Tout élément actif du plan (tables + murs/textes décoratifs, voir floor-plan-editor.ts) —
   *  pour un rendu visuel identique à l'éditeur. Murs/textes restent affichés mais ne sont
   *  jamais des cibles de transfert valides, voir isTransferTableFree(). */
  readonly transferPlanElements = computed<TableElement[]>(
    () => (this.transferSelectedRoom()?.tables ?? []).filter((table) => table.active),
  );

  @ViewChild('transferCanvas') private readonly transferCanvasRef?: ElementRef<HTMLDivElement>;
  private transferResizeObserver?: ResizeObserver;
  private readonly transferContainerSize = signal({ width: 0, height: 0 });

  /** Échelle du plan de transfert pour qu'il tienne toujours dans la modale sans barre de
   *  défilement — voir computeFitScale() et table-select.ts (même principe). */
  readonly transferScale = computed(() => {
    const room = this.transferSelectedRoom();
    const { width, height } = this.transferContainerSize();
    return room ? computeFitScale(width, height, room.width, room.height) : 1;
  });

  private readonly transferOccupiedTableIds = computed(() => {
    const set = new Set<number>();
    for (const o of this.transferOrders()) {
      if (o.table_id !== null) {
        set.add(o.table_id);
      }
    }
    return set;
  });

  // --- Paiement (voir Readme.md, POS - Restaurant étapes 4-6) — même pattern que pos-vente.ts ---
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly showPaymentModal = signal(false);
  readonly paymentLines = signal<PaymentLine[]>([]);
  readonly paying = signal(false);
  readonly paidTicket = signal<Ticket | null>(null);
  readonly printingThermal = signal(false);
  readonly thermalPrinted = signal(false);

  /** Code promo (voir DiscountCalculator) — même pattern que pos-vente.ts. */
  readonly discountCodeInput = signal('');
  readonly appliedDiscount = signal<ValidateDiscountResponse | null>(null);
  readonly discountError = signal<string | null>(null);
  readonly checkingDiscount = signal(false);

  /** Points fidélité à utiliser en réduction (voir App\Support\LoyaltyPoints) — même pattern que pos-vente.ts. */
  readonly pointsToRedeemInput = signal(0);

  readonly clientSearch = signal('');
  readonly clientResults = signal<Client[]>([]);
  readonly selectedClient = signal<Client | null>(null);
  readonly showNewClientForm = signal(false);
  readonly newClientFirstname = signal('');
  readonly newClientLastname = signal('');
  readonly newClientPhone = signal('');
  readonly savingClient = signal(false);

  readonly enteringMethod = signal<PaymentMethod | null>(null);
  readonly keypadBuffer = signal('');

  private readonly clientSearch$ = new Subject<string>();

  readonly sections = computed(() => this.order()?.sections ?? []);

  readonly activeSection = computed(() => this.sections().find((section) => section.id === this.activeSectionId()) ?? null);

  /** "On peut ajouter une section que si la précédente contient au moins un article" (voir Readme.md). */
  readonly canAddSection = computed(() => {
    const list = this.sections();
    const last = list[list.length - 1];
    return !last || last.lines.length > 0;
  });

  /** Une section "demandée"/"faite" est déjà partie en cuisine — plus modifiable (voir OrderLineController::assertEditable côté backend, source de vérité). */
  readonly activeSectionEditable = computed(() => this.activeSection()?.state === 'en_attente');

  /** Même principe que pos-vente (active_direct_sale) mais pour le POS Restaurant. */
  readonly availableProducts = computed(() => {
    const catalogId = this.activeRestaurantCatalogId();
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

  readonly orderTotal = computed(() =>
    this.sections().reduce((sum, section) => sum + this.sectionTotal(section), 0),
  );

  /** "Quand toutes les sections sont envoyées on peut payer" (voir Readme.md) — au moins une section, toutes à 'seed'. */
  readonly allSectionsSent = computed(() => {
    const list = this.sections();
    return list.length > 0 && list.every((section) => section.state === 'seed');
  });

  readonly discountAmount = computed(() => this.appliedDiscount()?.amount_off ?? 0);

  /** Conversion fixe points→€ — même pattern que pos-vente.ts. */
  readonly pointsAmount = computed(() => Math.round(this.pointsToRedeemInput() * 0.05 * 100) / 100);

  /** Total réellement dû après réduction (promo ET points, cumulables) — le serveur recalcule
   *  indépendamment au moment du paiement (voir OrderController::pay) ; ceci ne sert qu'à
   *  l'affichage/au clavier. */
  readonly payableTotal = computed(() =>
    Math.max(Math.round((this.orderTotal() - this.discountAmount() - this.pointsAmount()) * 100) / 100, 0),
  );

  readonly paidTotal = computed(() => this.paymentLines().reduce((sum, line) => sum + line.value, 0));
  readonly remaining = computed(() => Math.round((this.payableTotal() - this.paidTotal()) * 100) / 100);
  readonly canSubmitPayment = computed(
    () =>
      this.paymentLines().length > 0 &&
      Math.abs(this.remaining()) < 0.005 &&
      !this.paying() &&
      this.activeCashierService.activeSession() !== null,
  );

  readonly keypadValue = computed(() => Number(this.keypadBuffer()) || 0);
  /** Rendu à donner si le montant tapé au clavier dépasse ce qu'il reste à payer. */
  readonly changeDue = computed(() => Math.max(this.keypadValue() - this.remaining(), 0));
  /** Part du montant tapé réellement affectée au ticket (jamais plus que ce qui est dû). */
  readonly appliedAmount = computed(() => Math.min(this.keypadValue(), this.remaining()));

  constructor() {
    this.productService.list().subscribe((products) => this.allProducts.set(products));
    this.catalogService
      .list()
      .subscribe((catalogs) => this.activeRestaurantCatalogId.set(catalogs.find((c) => c.active_restaurant)?.id ?? null));
    this.paymentMethodService.list().subscribe((methods) => this.paymentMethods.set(methods));

    this.clientSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => this.clientService.search(query)),
      )
      .subscribe((results) => this.clientResults.set(results));

    this.refreshOrder(true);

    this.kitchenEcho.listen();
    this.kitchenEcho.orderUpdated.pipe(takeUntilDestroyed()).subscribe((orderId) => {
      // `paying()` ou `paidTicket()` déjà posés : c'est CETTE instance qui est en train de payer
      // (submitPayment) — le broadcast qu'elle reçoit est donc son propre événement. `paying()`
      // seul ne suffit pas : ShouldBroadcastNow diffuse de façon synchrone PENDANT la requête
      // HTTP de paiement côté serveur, donc le message WebSocket peut concrètement arriver ICI
      // avant même la réponse HTTP qui pose `paidTicket()` (deux aller-retours réseau distincts,
      // sans garantie d'ordre) — sans le flag `paying()` pour couvrir cette fenêtre, ce refetch
      // 404 sur la commande déjà supprimée et quitterait l'écran de reçu avant qu'il n'ait eu la
      // chance de s'afficher (vérifié : reproductible à chaque paiement sans ce garde-fou).
      if (orderId === this.orderId && !this.paying() && !this.paidTicket()) {
        this.refreshOrder();
      }
    });
  }

  productEmoji(product: Product): string {
    const categoryId = product.category?.id ?? product.id;
    return PRODUCT_EMOJIS[categoryId % PRODUCT_EMOJIS.length];
  }

  readonly formatMoney = formatMoney;

  sectionTotal(section: OrderSection): number {
    return section.lines.reduce((sum, line) => sum + this.lineTotal(line), 0);
  }

  /** Une ligne de correction (voir OrderController::correction) est stockée avec une quantity
   *  POSITIVE — c'est ici que son effet sur le total est inversé, jamais en base ("mettre le
   *  produit avec le montant en négatif"). */
  lineTotal(line: OrderLine): number {
    const sign = line.is_correction ? -1 : 1;
    return sign * Number(line.product?.price ?? 0) * line.quantity;
  }

  selectSection(section: OrderSection): void {
    this.activeSectionId.set(section.id);
  }

  addSection(): void {
    if (!this.canAddSection()) {
      return;
    }

    this.error.set(null);
    this.orderSectionService.create(this.orderId).subscribe({
      next: (section) => {
        this.refreshOrder(false, section.id);
      },
      error: (err) => this.error.set(err.error?.errors?.name?.[0] ?? "Impossible d'ajouter une section."),
    });
  }

  /** "On ne peut supprimer une section que si elle est vide" (voir Readme.md), en plus de devoir
   *  toujours en garder au moins une (vérifié aussi côté backend, source de vérité). */
  canRemoveSection(section: OrderSection): boolean {
    return this.sections().length > 1 && section.lines.length === 0;
  }

  removeSection(section: OrderSection, event: Event): void {
    event.stopPropagation();
    if (!this.canRemoveSection(section)) {
      return;
    }
    if (!confirm(`Supprimer "${section.name}" ?`)) {
      return;
    }

    this.error.set(null);
    this.orderSectionService.remove(section.id).subscribe({
      next: () => this.refreshOrder(),
      error: (err) => this.error.set(err.error?.errors?.name?.[0] ?? 'Impossible de supprimer cette section.'),
    });
  }

  addProduct(product: Product): void {
    const section = this.activeSection();
    if (!section || !this.activeSectionEditable()) {
      return;
    }

    this.orderLineService.add(section.id, product.id).subscribe({
      next: () => this.refreshOrder(),
      error: () => this.error.set("Impossible d'ajouter ce produit."),
    });
  }

  incrementLine(lineId: number, quantity: number): void {
    if (!this.activeSectionEditable()) {
      return;
    }
    this.orderLineService.updateQuantity(lineId, quantity + 1).subscribe(() => this.refreshOrder());
  }

  decrementLine(lineId: number, quantity: number): void {
    if (!this.activeSectionEditable()) {
      return;
    }
    if (quantity <= 1) {
      this.removeLine(lineId);
      return;
    }
    this.orderLineService.updateQuantity(lineId, quantity - 1).subscribe(() => this.refreshOrder());
  }

  removeLine(lineId: number): void {
    if (!this.activeSectionEditable()) {
      return;
    }
    this.orderLineService.remove(lineId).subscribe(() => this.refreshOrder());
  }

  startEditingNote(line: OrderLine): void {
    if (!this.activeSectionEditable()) {
      return;
    }
    this.editingNoteLineId.set(line.id);
    this.noteDraft.set(line.note ?? '');
  }

  cancelEditingNote(): void {
    this.editingNoteLineId.set(null);
    this.noteDraft.set('');
  }

  saveNote(line: OrderLine): void {
    const note = this.noteDraft().trim() || null;
    this.orderLineService.updateNote(line.id, note).subscribe(() => {
      this.editingNoteLineId.set(null);
      this.noteDraft.set('');
      this.refreshOrder();
    });
  }

  /**
   * "Valider" (voir Readme.md, deux actions distinctes confirmées par l'utilisateur) : verrouille
   * la section (plus modifiable) et l'envoie sur le kitchen display, mais ne la met pas encore
   * en file d'attente active des postes — voir ::demanderSection pour ça, action séparée.
   */
  validerSection(section: OrderSection): void {
    if (section.state !== 'en_attente' || section.lines.length === 0) {
      return;
    }
    if (!confirm(`Valider "${section.name}" et l'envoyer sur le kitchen display ?`)) {
      return;
    }

    this.error.set(null);
    this.orderSectionService.valider(section.id).subscribe({
      next: () => this.refreshOrder(),
      error: (err) => this.error.set(err.error?.errors?.state?.[0] ?? "Impossible de valider cette section."),
    });
  }

  /** "Demander en cuisine" (voir Readme.md) — met une section déjà validée en file d'attente active des postes. */
  demanderSection(section: OrderSection): void {
    if (section.state !== 'send') {
      return;
    }
    if (!confirm(`Demander "${section.name}" en cuisine ?`)) {
      return;
    }

    this.error.set(null);
    this.orderSectionService.demander(section.id).subscribe({
      next: () => this.refreshOrder(),
      error: (err) => this.error.set(err.error?.errors?.state?.[0] ?? "Impossible de demander cette section en cuisine."),
    });
  }

  sectionStateLabel(state: OrderSection['state']): string {
    return { en_attente: 'En attente', send: 'Validée', ask: 'Demandée', do: 'Prête', seed: 'Envoyée', done: 'Servie' }[state];
  }

  // --- Correction ("un produit en trop") ---

  openCorrectionModal(): void {
    if (!this.allSectionsSent()) {
      return;
    }
    this.correctionQuantities.set({});
    this.correctionError.set(null);
    this.showCorrectionModal.set(true);
  }

  closeCorrectionModal(): void {
    this.showCorrectionModal.set(false);
    this.correctionQuantities.set({});
    this.correctionError.set(null);
  }

  correctionQuantityFor(productId: number): number {
    return this.correctionQuantities()[productId] ?? 0;
  }

  setCorrectionQuantity(productId: number, netQuantity: number, value: number): void {
    const clamped = Math.max(0, Math.min(Math.floor(value) || 0, netQuantity));
    this.correctionQuantities.set({ ...this.correctionQuantities(), [productId]: clamped });
  }

  submitCorrection(): void {
    const order = this.order();
    if (!order || !this.hasCorrectionsToSubmit() || this.correcting()) {
      return;
    }

    const lines = Object.entries(this.correctionQuantities())
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({ product_id: Number(productId), quantity }));

    this.correcting.set(true);
    this.correctionError.set(null);

    this.orderService.correction(order.id, { lines }).subscribe({
      next: () => {
        this.correcting.set(false);
        this.closeCorrectionModal();
        this.refreshOrder();
      },
      error: (err) => {
        this.correcting.set(false);
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.correctionError.set((messages?.length ? messages.join(' ') : err.error?.message) ?? 'Impossible de corriger la commande.');
      },
    });
  }

  // --- Client (même pattern que pos-vente.ts) ---

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
    this.pointsToRedeemInput.set(0);
  }

  clearClient(): void {
    this.selectedClient.set(null);
    this.pointsToRedeemInput.set(0);
  }

  /** Même pattern que pos-vente.ts::setPointsToRedeem. */
  setPointsToRedeem(value: number): void {
    const balance = this.selectedClient()?.points_balance ?? 0;
    this.pointsToRedeemInput.set(Math.max(0, Math.min(Math.floor(value) || 0, balance)));
    if (this.paymentLines().length > 0) {
      this.paymentLines.set([]);
    }
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

  // --- Paiement (même pattern que pos-vente.ts) ---

  openPaymentModal(): void {
    if (!this.allSectionsSent()) {
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
    this.appliedDiscount.set(null);
    this.discountCodeInput.set('');
    this.discountError.set(null);
    this.pointsToRedeemInput.set(0);
  }

  applyDiscountCode(): void {
    const code = this.discountCodeInput().trim().toUpperCase();
    if (!code || this.checkingDiscount()) {
      return;
    }

    // Agrégé net par produit (les corrections, voir OrderController::correction, se déduisent
    // ici) : /discounts/validate exige une quantity positive, une ligne de correction n'a donc
    // pas sa place telle quelle — seul le total net importe pour l'aperçu (le paiement réel,
    // lui, recalcule tout côté serveur à partir des vraies lignes, voir OrderController::pay).
    const netQuantities = new Map<number, number>();
    for (const section of this.sections()) {
      for (const line of section.lines) {
        const delta = line.is_correction ? -line.quantity : line.quantity;
        netQuantities.set(line.product_id, (netQuantities.get(line.product_id) ?? 0) + delta);
      }
    }
    const lines = Array.from(netQuantities.entries())
      .filter(([, quantity]) => quantity > 0)
      .map(([product_id, quantity]) => ({ product_id, quantity }));

    this.checkingDiscount.set(true);
    this.discountError.set(null);

    this.discountService.validate(code, lines).subscribe({
      next: (result) => {
        this.checkingDiscount.set(false);
        this.appliedDiscount.set(result);
        this.paymentLines.set([]);
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
    this.paymentLines.set([]);
  }

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

    const value = Math.min(typed, this.remaining());
    this.paymentLines.set([...this.paymentLines(), { method, value }]);
    this.enteringMethod.set(null);
    this.keypadBuffer.set('');
  }

  removePayment(index: number): void {
    this.paymentLines.set(this.paymentLines().filter((_, i) => i !== index));
  }

  submitPayment(): void {
    const order = this.order();
    if (!order || !this.canSubmitPayment()) {
      return;
    }

    this.error.set(null);
    this.paying.set(true);

    this.orderService
      .pay(order.id, {
        client_id: this.selectedClient()?.id ?? null,
        cash_session_id: this.activeCashierService.activeSession()?.id ?? null,
        discount_code: this.appliedDiscount()?.discount.code ?? null,
        points_redeemed: this.pointsToRedeemInput() > 0 ? this.pointsToRedeemInput() : null,
        payments: this.paymentLines().map((line) => ({ payment_method_id: line.method.id, value: line.value })),
      })
      .subscribe({
        next: (ticket) => {
          this.paying.set(false);
          this.showPaymentModal.set(false);
          this.paidTicket.set(ticket);
        },
        error: (err) => {
          this.paying.set(false);
          const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
          this.error.set(messages?.length ? messages.join(' ') : err.error?.message ?? "Impossible d'enregistrer le paiement.");
        },
      });
  }

  printTicket(): void {
    window.print();
  }

  printThermal(): void {
    const ticket = this.paidTicket();
    if (!ticket || this.printingThermal()) {
      return;
    }

    this.printingThermal.set(true);
    this.error.set(null);
    this.ticketService.printThermal(ticket.id).subscribe({
      next: () => {
        this.printingThermal.set(false);
        this.thermalPrinted.set(true);
      },
      error: (err) => {
        this.printingThermal.set(false);
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.error.set((messages?.length ? messages.join(' ') : err.error?.message) ?? "Impossible d'imprimer sur l'imprimante thermique.");
      },
    });
  }

  goToTableSelect(): void {
    this.router.navigateByUrl('/pos-restaurant');
  }

  openTransferModal(): void {
    this.transferError.set(null);
    this.showTransferModal.set(true);

    this.roomService.list().subscribe((rooms) => {
      this.transferRooms.set(rooms);
      const restaurantRooms = rooms.filter((room) => room.type === 'restaurant' && room.active);
      if (restaurantRooms.length > 0 && this.transferSelectedRoomId() === null) {
        this.transferSelectedRoomId.set(restaurantRooms[0].id);
      }
    });
    this.orderService.list().subscribe((orders) => this.transferOrders.set(orders));

    // Le canvas n'existe dans le DOM qu'une fois la modale ouverte (@if) — laisser Angular
    // rendre avant d'y attacher le ResizeObserver (même pattern que startScan() côté caméra).
    setTimeout(() => this.observeTransferCanvas());
  }

  closeTransferModal(): void {
    this.showTransferModal.set(false);
    this.transferResizeObserver?.disconnect();
  }

  private observeTransferCanvas(): void {
    const el = this.transferCanvasRef?.nativeElement;
    if (!el) {
      return;
    }

    this.transferResizeObserver?.disconnect();
    this.transferResizeObserver = new ResizeObserver(() => {
      this.transferContainerSize.set({ width: el.clientWidth, height: el.clientHeight });
    });
    this.transferResizeObserver.observe(el);
  }

  selectTransferRoom(id: number): void {
    this.transferSelectedRoomId.set(id);
  }

  /** Libre = une vraie table, pas occupée par une autre commande, et différente de la table actuelle. */
  isTransferTableFree(table: TableElement): boolean {
    const order = this.order();
    if (!order || table.type !== 'table' || table.id === order.table_id) {
      return false;
    }
    return !this.transferOccupiedTableIds().has(table.id);
  }

  confirmTransfer(table: TableElement): void {
    const order = this.order();
    if (!order || !this.isTransferTableFree(table) || this.transferring()) {
      return;
    }

    this.transferring.set(true);
    this.transferError.set(null);

    this.orderService.transfer(order.id, { table_id: table.id }).subscribe({
      next: () => {
        this.transferring.set(false);
        this.showTransferModal.set(false);
        this.refreshOrder();
      },
      error: (err) => {
        this.transferring.set(false);
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.transferError.set(messages?.length ? messages.join(' ') : 'Impossible de transférer cette table.');
      },
    });
  }

  private refreshOrder(isInitial = false, focusSectionId?: number): void {
    if (isInitial) {
      this.loading.set(true);
    }

    this.orderService.get(this.orderId).subscribe({
      next: (order) => {
        this.order.set(order);
        this.loading.set(false);

        const currentActive = this.activeSectionId();
        const stillExists = order.sections.some((section) => section.id === currentActive);
        if (focusSectionId !== undefined) {
          this.activeSectionId.set(focusSectionId);
        } else if (!stillExists) {
          this.activeSectionId.set(order.sections[0]?.id ?? null);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        // 404 : la commande a été payée ou annulée depuis une AUTRE instance de POS - Restaurant
        // (voir Readme.md : "synchroniser les différentes instances... quand une table est
        // ouverte ou payée") — pas une vraie erreur pour cette instance-ci, juste la conséquence
        // attendue du live-sync. Retour à la sélection de table plutôt qu'un message d'erreur qui
        // n'a plus rien à faire là (paidTicket() reste `null` ici : SI c'est cette instance qui
        // vient de payer, submitPayment() a déjà posé paidTicket avant que ce refetch n'échoue).
        if (err.status === 404) {
          this.goToTableSelect();
          return;
        }
        this.error.set('Impossible de charger cette commande.');
      },
    });
  }

  ngOnDestroy(): void {
    this.transferResizeObserver?.disconnect();
  }
}
