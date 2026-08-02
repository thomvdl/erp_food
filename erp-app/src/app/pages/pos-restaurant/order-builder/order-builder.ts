import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { OrderService } from '../../../core/order.service';
import { OrderSectionService } from '../../../core/order-section.service';
import { OrderLineService } from '../../../core/order-line.service';
import { ProductService } from '../../../core/product.service';
import { ProductCatalogService } from '../../../core/product-catalog.service';
import { PaymentMethodService } from '../../../core/payment-method.service';
import { ClientService } from '../../../core/client.service';
import { ActiveCashierService } from '../../../core/active-cashier.service';
import { RoomService } from '../../../core/room.service';
import { Order, OrderLine, OrderSection } from '../../../core/models/order.model';
import { Product } from '../../../core/models/product.model';
import { ProductCategory } from '../../../core/models/catalog.model';
import { Room, TableElement } from '../../../core/models/floor-plan.model';
import { Client, PaymentMethod, Ticket } from '../../../core/models/ticket.model';
import { KitchenEchoService } from '../../../core/kitchen-echo.service';
import { formatMoney } from '../../../core/ticket-print.util';
import { TicketReceipt } from '../../../shared/ticket-receipt/ticket-receipt';

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
export class OrderBuilder {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orderService = inject(OrderService);
  private readonly orderSectionService = inject(OrderSectionService);
  private readonly orderLineService = inject(OrderLineService);
  private readonly productService = inject(ProductService);
  private readonly catalogService = inject(ProductCatalogService);
  private readonly paymentMethodService = inject(PaymentMethodService);
  private readonly clientService = inject(ClientService);
  readonly activeCashierService = inject(ActiveCashierService);
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
  readonly transferTables = computed<TableElement[]>(() => (this.transferSelectedRoom()?.tables ?? []).filter((table) => table.active));

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

  readonly clientSearch = signal('');
  readonly clientResults = signal<Client[]>([]);
  readonly selectedClient = signal<Client | null>(null);
  readonly showNewClientForm = signal(false);
  readonly newClientFirstname = signal('');
  readonly newClientLastname = signal('');
  readonly newClientPhone = signal('');
  readonly savingClient = signal(false);
  readonly sendEmailOnPay = signal(true);

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
    this.sections().reduce(
      (sum, section) => sum + section.lines.reduce((lineSum, line) => lineSum + Number(line.product?.price ?? 0) * line.quantity, 0),
      0,
    ),
  );

  /** "Quand toutes les sections sont envoyées on peut payer" (voir Readme.md) — au moins une section, toutes à 'seed'. */
  readonly allSectionsSent = computed(() => {
    const list = this.sections();
    return list.length > 0 && list.every((section) => section.state === 'seed');
  });

  readonly paidTotal = computed(() => this.paymentLines().reduce((sum, line) => sum + line.value, 0));
  readonly remaining = computed(() => Math.round((this.orderTotal() - this.paidTotal()) * 100) / 100);
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
    return section.lines.reduce((sum, line) => sum + Number(line.product?.price ?? 0) * line.quantity, 0);
  }

  lineTotal(line: OrderLine): number {
    return Number(line.product?.price ?? 0) * line.quantity;
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
        send_email: this.sendEmailOnPay() && !!this.selectedClient(),
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

  cancelOrder(): void {
    const order = this.order();
    if (!order || !confirm('Annuler cette commande et libérer la table ?')) {
      return;
    }

    this.orderService.cancel(order.id).subscribe(() => this.goToTableSelect());
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
  }

  closeTransferModal(): void {
    this.showTransferModal.set(false);
  }

  selectTransferRoom(id: number): void {
    this.transferSelectedRoomId.set(id);
  }

  /** Libre = pas occupée par une autre commande, et différente de la table actuelle. */
  isTransferTableFree(table: TableElement): boolean {
    const order = this.order();
    if (!order || table.id === order.table_id) {
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
}
