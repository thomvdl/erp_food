import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, forkJoin, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth.service';
import { OrderService } from '../../../core/order.service';
import { OrderSectionService } from '../../../core/order-section.service';
import { OrderLineService } from '../../../core/order-line.service';
import { ProductService } from '../../../core/product.service';
import { ProductCatalogService } from '../../../core/product-catalog.service';
import { PaymentMethodService } from '../../../core/payment-method.service';
import { ClientService } from '../../../core/client.service';
import { TicketService } from '../../../core/ticket.service';
import { ActivePrinterService } from '../../../core/active-printer.service';
import { DiscountService } from '../../../core/discount.service';
import { ActiveCashierService } from '../../../core/active-cashier.service';
import { RoomService } from '../../../core/room.service';
import { Order, OrderLine, OrderSection } from '../../../core/models/order.model';
import { MenuGroup, Product, ProductComponent } from '../../../core/models/product.model';
import { MenuChoice, MenuChoiceProductNote } from '../../../core/models/menu-choice.model';
import { ProductCategory } from '../../../core/models/catalog.model';
import { Room, TableElement } from '../../../core/models/floor-plan.model';
import { Client, PaymentMethod, Ticket } from '../../../core/models/ticket.model';
import { ValidateDiscountResponse } from '../../../core/models/discount.model';
import { KitchenEchoService } from '../../../core/kitchen-echo.service';
import { ProductStockEchoService } from '../../../core/product-stock-echo.service';
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

/** En dessous de ce nombre restant, le stock affiché passe en couleur d'alerte (voir
 *  isLowStock()) — purement visuel, n'affecte ni la commande ni le calcul. */
const LOW_STOCK_THRESHOLD = 3;

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
  private readonly activePrinterService = inject(ActivePrinterService);
  private readonly discountService = inject(DiscountService);
  readonly activeCashierService = inject(ActiveCashierService);
  readonly authService = inject(AuthService);
  private readonly kitchenEcho = inject(KitchenEchoService);
  private readonly productStockEcho = inject(ProductStockEchoService);
  private readonly roomService = inject(RoomService);

  private readonly orderId = Number(this.route.snapshot.paramMap.get('orderId'));

  readonly order = signal<Order | null>(null);
  readonly loading = signal(true);
  readonly activeSectionId = signal<number | null>(null);

  readonly allProducts = signal<Product[]>([]);
  /** Plusieurs catalogues peuvent être actifs à la fois pour le POS Restaurant, voir
   *  ProductCatalog.active_restaurant. */
  readonly activeRestaurantCatalogIds = signal<number[]>([]);

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
   *  commande — seuls ceux encore net positif ont un sens à corriger. !line.priced exclu : un
   *  composant de menu (voir App\Support\MenuResolver côté API) n'a jamais été facturé
   *  séparément, le serveur refuse déjà sa correction (voir OrderController::correction) — pas
   *  la peine de le proposer ici pour finir en erreur. */
  readonly correctableLines = computed(() => {
    const byProduct = new Map<number, { product_id: number; name: string; netQuantity: number }>();
    for (const section of this.sections()) {
      for (const line of section.lines) {
        if (!line.priced) {
          continue;
        }
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

  // --- Menu à choix (voir App\Support\MenuResolver côté API) — contrairement à un combo (ajouté
  // tel quel, éclaté automatiquement côté serveur), un menu exige que le client choisisse un ou
  // plusieurs produits par groupe AVANT l'ajout : cette modale bloque tant que chaque groupe n'a
  // pas un nombre de sélections entre min_choices et max_choices. ---
  readonly showMenuModal = signal<Product | null>(null);
  readonly menuSelections = signal<Map<number, number[]>>(new Map());
  /** Nombre d'exemplaires de CETTE configuration (mêmes choix) à ajouter en un coup — voir
   *  confirmAddMenu(). */
  readonly menuQuantity = signal(1);
  readonly addingMenu = signal(false);
  readonly menuError = signal<string | null>(null);
  /** Ingrédients retirés PAR produit choisi dans le menu (ex. le plat pris dans une formule), pas
   *  pour le menu lui-même — clé "{groupId}:{productId}" (voir menuOptionKey()), même pattern que
   *  pos-vente.ts. */
  readonly menuOptionExclusions = signal<Map<string, Set<number>>>(new Map());
  readonly showMenuOptionIngredientsModal = signal<{ group: MenuGroup; product: ProductComponent } | null>(null);
  readonly menuOptionExcludedIngredientIds = signal<Set<number>>(new Set());

  readonly canConfirmMenu = computed(() => {
    const product = this.showMenuModal();
    return !!product && (product.menu_groups ?? []).every((group) => this.isMenuGroupValid(group));
  });

  // --- Personnalisation des ingrédients (voir Product.ingredients) — modale ouverte au clic
  // uniquement si le produit a au moins un ingrédient retirable, sinon ajout direct comme avant. ---
  readonly showIngredientsModal = signal<Product | null>(null);
  readonly excludedIngredientIds = signal<Set<number>>(new Set());
  readonly ingredientsQuantity = signal(1);

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

  /** Sections qu'un "Valider toutes les sections" peut réellement traiter — même condition que le
   *  bouton "Valider" individuel (section.lines.length === 0 le désactive déjà, voir template). */
  readonly validatableSections = computed(() => this.sections().filter((section) => section.state === 'en_attente' && section.lines.length > 0));

  /** Modale "+ Ajouter une section" — propose des noms de tournée courants (Entrée/Plat/Dessert)
   *  plutôt que de systématiquement retomber sur "Section N", voir addSection(). */
  readonly showAddSectionModal = signal(false);

  /** Une section "demandée"/"faite" est déjà partie en cuisine — plus modifiable (voir OrderLineController::assertEditable côté backend, source de vérité). */
  readonly activeSectionEditable = computed(() => this.activeSection()?.state === 'en_attente');

  /** Même principe que pos-vente (active_direct_sale) mais pour le POS Restaurant — union de
   *  tous les catalogues actifs, pas un seul catalogue exclusif. */
  readonly availableProducts = computed(() => {
    const catalogIds = this.activeRestaurantCatalogIds();
    if (catalogIds.length === 0) {
      return [];
    }
    return this.allProducts().filter(
      (product) => product.active && (product.catalogs ?? []).some((catalog) => catalogIds.includes(catalog.id)),
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
      .subscribe((catalogs) =>
        this.activeRestaurantCatalogIds.set(catalogs.filter((c) => c.active_restaurant).map((c) => c.id)),
      );
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

    // Voir App\Events\ProductStockUpdated — grise/dégrise une tuile produit en direct (vente
    // depuis un autre poste, ou réapprovisionnement admin) sans recharger toute la liste produits.
    this.productStockEcho.listen();
    this.productStockEcho.stockUpdated.pipe(takeUntilDestroyed()).subscribe(({ productId, stockQuantity }) => {
      this.allProducts.set(
        this.allProducts().map((product) => (product.id === productId ? { ...product, stock_quantity: stockQuantity } : product)),
      );
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
   *  produit avec le montant en négatif"). Une ligne composant d'un menu (priced=false, voir
   *  App\Support\MenuResolver côté API) ne compte jamais dans le total — déjà porté par la ligne
   *  "porteuse" du menu — même filtre que OrderController::pay côté serveur, sinon le total
   *  affiché ici facturerait le menu ET la somme de ses composants (et le paiement échouerait,
   *  le serveur recalculant le bon total). */
  lineTotal(line: OrderLine): number {
    if (!line.priced) {
      return 0;
    }
    const sign = line.is_correction ? -1 : 1;
    return sign * Number(line.product?.price ?? 0) * line.quantity;
  }

  /** Ligne issue de l'éclatement d'un menu (voir App\Support\MenuResolver côté API) — soit un
   *  composant (menu_id renseigné), soit la ligne "porteuse" elle-même (product_id = le menu,
   *  priced=true). Sa quantité ne doit jamais être modifiée à la volée via le stepper +/- : la
   *  ligne porteuse et ses composants doivent toujours rester synchronisés (ex. 2× "Menu du jour"
   *  facturé mais 1 seule "Salade" préparée si on incrémente juste la ligne porteuse à part) — le
   *  seul moyen sûr de changer une quantité de menu est de le retirer et de le rajouter via la
   *  modale de choix. */
  isMenuLine(line: OrderLine): boolean {
    return line.menu_id !== null || line.product?.is_menu === true;
  }

  /** La ligne "porteuse" (voir isMenuLine) est la seule des deux à porter une action de retrait
   *  possible (removeMenu()) — un composant seul (menu_id renseigné) ne peut pas être retiré
   *  isolément, voir template. */
  isMenuCarrierLine(line: OrderLine): boolean {
    return line.product?.is_menu === true;
  }

  selectSection(section: OrderSection): void {
    this.activeSectionId.set(section.id);
  }

  openAddSectionModal(): void {
    if (!this.canAddSection()) {
      return;
    }
    this.error.set(null);
    this.showAddSectionModal.set(true);
  }

  closeAddSectionModal(): void {
    this.showAddSectionModal.set(false);
  }

  /** Voir showAddSectionModal — "Entrée"/"Plat"/"Dessert" pré-remplissent le nom (et rejoignent
   *  ainsi directement la même section qu'utiliserait un menu réparti avec ce label, voir
   *  App\Http\Controllers\Api\OrderLineController::resolveSectionForGroup côté API) ; "Autre"
   *  laisse `name` vide, le serveur retombe sur "Section N" auto-numéroté comme avant. */
  addSection(name?: string): void {
    if (!this.canAddSection()) {
      return;
    }

    this.error.set(null);
    this.orderSectionService.create(this.orderId, name).subscribe({
      next: (section) => {
        this.closeAddSectionModal();
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

  /** Quantité déjà commandée pour ce produit sur CETTE commande, toutes sections confondues (y
   *  compris déjà envoyées en cuisine — elles consommeront quand même le stock au paiement, voir
   *  OrderController::pay). Lignes de correction exclues : elles n'ajoutent jamais de nouvelle
   *  consommation, voir App\Support\StockManager. */
  quantityInOrder(product: Product): number {
    return this.sections().reduce(
      (sum, section) =>
        sum +
        section.lines
          .filter((line) => line.product_id === product.id && !line.is_correction)
          .reduce((lineSum, line) => lineSum + line.quantity, 0),
      0,
    );
  }

  /** `null` = stock non suivi, jamais affiché/décompté. Contrairement à pos-vente.ts (panier
   *  local), chaque ajout persiste directement en base (voir addProduct()) — la quantité déjà
   *  commandée sur cette table (quantityInOrder ci-dessus) tient donc lieu de "panier". Mis à
   *  jour en temps réel par ProductStockEchoService (voir constructor()) à chaque vente ou
   *  réapprovisionnement, sur ce poste comme sur n'importe quel autre. */
  remainingStock(product: Product): number | null {
    return product.stock_quantity === null ? null : product.stock_quantity - this.quantityInOrder(product);
  }

  isOutOfStock(product: Product): boolean {
    const remaining = this.remainingStock(product);
    return remaining !== null && remaining <= 0;
  }

  /** Repère visuel (couleur d'alerte) en dessous de ce seuil — n'affecte ni la commande ni le
   *  calcul, juste l'attention du serveur avant que ça tombe à zéro. */
  isLowStock(product: Product): boolean {
    const remaining = this.remainingStock(product);
    return remaining !== null && remaining > 0 && remaining <= LOW_STOCK_THRESHOLD;
  }

  addProduct(product: Product): void {
    const section = this.activeSection();
    if (!section || !this.activeSectionEditable() || this.isOutOfStock(product)) {
      return;
    }

    if (product.is_menu) {
      this.openMenuModal(product);
      return;
    }

    if (this.hasRemovableIngredients(product)) {
      this.openIngredientsModal(product);
      return;
    }

    this.orderLineService.add(section.id, product.id).subscribe({
      next: () => this.refreshOrder(),
      error: () => this.error.set("Impossible d'ajouter ce produit."),
    });
  }

  private hasRemovableIngredients(product: Product): boolean {
    return (product.ingredients ?? []).some((ingredient) => ingredient.pivot.removable);
  }

  // --- Modale de personnalisation (voir Product.ingredients) ---

  openIngredientsModal(product: Product): void {
    this.showIngredientsModal.set(product);
    this.excludedIngredientIds.set(new Set());
    this.ingredientsQuantity.set(1);
  }

  closeIngredientsModal(): void {
    this.showIngredientsModal.set(null);
    this.excludedIngredientIds.set(new Set());
    this.ingredientsQuantity.set(1);
  }

  isIngredientExcluded(ingredientId: number): boolean {
    return this.excludedIngredientIds().has(ingredientId);
  }

  toggleExcludedIngredient(ingredientId: number): void {
    const next = new Set(this.excludedIngredientIds());
    if (next.has(ingredientId)) {
      next.delete(ingredientId);
    } else {
      next.add(ingredientId);
    }
    this.excludedIngredientIds.set(next);
  }

  setIngredientsQuantity(value: number): void {
    this.ingredientsQuantity.set(Math.max(1, Math.floor(value) || 1));
  }

  /** Résumé texte de la personnalisation en cours — affiché dans la modale ET utilisé comme note
   *  de ligne (voir confirmAddIngredients()). Vide si rien n'est décoché. */
  ingredientsNotePreview(): string {
    const product = this.showIngredientsModal();
    if (!product) {
      return '';
    }
    const excluded = this.excludedIngredientIds();
    const names = (product.ingredients ?? []).filter((i) => excluded.has(i.id)).map((i) => `Sans ${i.name}`);
    return names.join(', ');
  }

  confirmAddIngredients(): void {
    const section = this.activeSection();
    const product = this.showIngredientsModal();
    if (!section || !product) {
      return;
    }

    const note = this.ingredientsNotePreview() || null;
    this.orderLineService.add(section.id, product.id, undefined, this.ingredientsQuantity(), note).subscribe({
      next: () => {
        this.closeIngredientsModal();
        this.refreshOrder();
      },
      error: () => this.error.set("Impossible d'ajouter ce produit."),
    });
  }

  // --- Menu à choix ---

  openMenuModal(product: Product): void {
    this.showMenuModal.set(product);
    this.menuSelections.set(new Map((product.menu_groups ?? []).map((group) => [group.id, []])));
    this.menuQuantity.set(1);
    this.menuError.set(null);
    this.menuOptionExclusions.set(new Map());
  }

  closeMenuModal(): void {
    this.showMenuModal.set(null);
    this.menuSelections.set(new Map());
    this.menuQuantity.set(1);
    this.menuError.set(null);
    this.menuOptionExclusions.set(new Map());
  }

  setMenuQuantity(value: number): void {
    this.menuQuantity.set(Math.max(1, Math.floor(value) || 1));
  }

  menuGroupSelection(groupId: number): number[] {
    return this.menuSelections().get(groupId) ?? [];
  }

  isMenuOptionSelected(groupId: number, productId: number): boolean {
    return this.menuGroupSelection(groupId).includes(productId);
  }

  /** Groupe à max_choices=1 : sélection exclusive (radio). Sinon : coche/décoche jusqu'à
   *  max_choices, un choix au-delà du maximum est simplement ignoré plutôt que de remplacer un
   *  choix existant (le serveur doit explicitement en retirer un d'abord). */
  toggleMenuOption(group: MenuGroup, productId: number): void {
    const current = this.menuGroupSelection(group.id);
    const next = new Map(this.menuSelections());

    if (group.max_choices === 1) {
      // Re-cliquer l'option déjà sélectionnée d'un groupe obligatoire (min_choices >= 1) ne fait
      // rien — jamais de désélection accidentelle (double-tap tactile notamment, voir bug
      // "reçu : 0" côté App\Support\MenuResolver). Un groupe facultatif (min_choices === 0) peut,
      // lui, repasser à vide.
      if (!current.includes(productId)) {
        next.set(group.id, [productId]);
      } else if (group.min_choices === 0) {
        next.set(group.id, []);
      } else {
        return;
      }
    } else if (current.includes(productId)) {
      next.set(group.id, current.filter((id) => id !== productId));
    } else if (current.length < group.max_choices) {
      next.set(group.id, [...current, productId]);
    } else {
      return;
    }

    this.menuSelections.set(next);
  }

  isMenuGroupValid(group: MenuGroup): boolean {
    const count = this.menuGroupSelection(group.id).length;
    return count >= group.min_choices && count <= group.max_choices;
  }

  // --- Personnalisation d'un produit choisi À L'INTÉRIEUR d'un menu (ex. "le plat pris dans la
  // formule, sans oignon") — modale imbriquée dans la modale menu, même mécanique que
  // showIngredientsModal mais sur une option de groupe plutôt qu'une ligne de commande, résultat
  // stocké dans menuOptionExclusions plutôt qu'envoyé directement au serveur. ---

  private menuOptionKey(groupId: number, productId: number): string {
    return `${groupId}:${productId}`;
  }

  optionHasRemovableIngredients(option: ProductComponent): boolean {
    return (option.ingredients ?? []).some((ingredient) => ingredient.pivot.removable);
  }

  openMenuOptionIngredientsModal(group: MenuGroup, option: ProductComponent): void {
    this.showMenuOptionIngredientsModal.set({ group, product: option });
    this.menuOptionExcludedIngredientIds.set(new Set(this.menuOptionExclusions().get(this.menuOptionKey(group.id, option.id)) ?? []));
  }

  closeMenuOptionIngredientsModal(): void {
    this.showMenuOptionIngredientsModal.set(null);
    this.menuOptionExcludedIngredientIds.set(new Set());
  }

  isMenuOptionIngredientExcluded(ingredientId: number): boolean {
    return this.menuOptionExcludedIngredientIds().has(ingredientId);
  }

  toggleMenuOptionExcludedIngredient(ingredientId: number): void {
    const next = new Set(this.menuOptionExcludedIngredientIds());
    if (next.has(ingredientId)) {
      next.delete(ingredientId);
    } else {
      next.add(ingredientId);
    }
    this.menuOptionExcludedIngredientIds.set(next);
  }

  menuOptionNotePreview(): string {
    const current = this.showMenuOptionIngredientsModal();
    if (!current) {
      return '';
    }
    const excluded = this.menuOptionExcludedIngredientIds();
    return (current.product.ingredients ?? [])
      .filter((ingredient) => excluded.has(ingredient.id))
      .map((ingredient) => `Sans ${ingredient.name}`)
      .join(', ');
  }

  confirmMenuOptionIngredients(): void {
    const current = this.showMenuOptionIngredientsModal();
    if (!current) {
      return;
    }

    const key = this.menuOptionKey(current.group.id, current.product.id);
    const next = new Map(this.menuOptionExclusions());
    if (this.menuOptionExcludedIngredientIds().size > 0) {
      next.set(key, new Set(this.menuOptionExcludedIngredientIds()));
    } else {
      next.delete(key);
    }
    this.menuOptionExclusions.set(next);
    this.closeMenuOptionIngredientsModal();
  }

  /** Résumé texte ("Sans oignon") de la personnalisation déjà enregistrée pour cette option —
   *  affiché sous sa pastille dans la modale menu, et réutilisé tel quel comme note de la ligne
   *  composant côté serveur (voir confirmAddMenu() et App\Support\MenuResolver::resolve). */
  menuOptionNoteFor(groupId: number, productId: number): string {
    const excluded = this.menuOptionExclusions().get(this.menuOptionKey(groupId, productId));
    if (!excluded || excluded.size === 0) {
      return '';
    }
    const group = (this.showMenuModal()?.menu_groups ?? []).find((g) => g.id === groupId);
    const option = group?.options.find((o) => o.id === productId);
    return (option?.ingredients ?? [])
      .filter((ingredient) => excluded.has(ingredient.id))
      .map((ingredient) => `Sans ${ingredient.name}`)
      .join(', ');
  }

  confirmAddMenu(): void {
    const product = this.showMenuModal();
    const section = this.activeSection();
    if (!product || !section || !this.canConfirmMenu() || this.addingMenu()) {
      return;
    }

    const menuChoices: MenuChoice[] = Array.from(this.menuSelections().entries()).map(([menu_group_id, product_ids]) => {
      const product_notes: MenuChoiceProductNote[] = product_ids
        .map((product_id) => ({ product_id, note: this.menuOptionNoteFor(menu_group_id, product_id) }))
        .filter((entry) => entry.note !== '');
      return product_notes.length > 0 ? { menu_group_id, product_ids, product_notes } : { menu_group_id, product_ids };
    });

    this.addingMenu.set(true);
    this.menuError.set(null);

    this.orderLineService.add(section.id, product.id, menuChoices, this.menuQuantity()).subscribe({
      next: () => {
        this.addingMenu.set(false);
        this.closeMenuModal();
        this.refreshOrder();
      },
      error: (err) => {
        this.addingMenu.set(false);
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.menuError.set((messages?.length ? messages.join(' ') : err.error?.message) ?? "Impossible d'ajouter ce menu.");
      },
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

  /** Seul moyen de retirer un menu déjà ajouté (voir isMenuLine/isMenuCarrierLine) — supprime la
   *  ligne porteuse ET tous ses composants, y compris répartis dans d'autres sections (voir
   *  OrderLineController::destroyMenu). `line` doit être la ligne porteuse. */
  /** Pas de garde sur activeSectionEditable() ici : la ligne porteuse vit typiquement dans
   *  "Addition" (voir OrderLineController::resolveCarrierSection), jamais 'en_attente' une fois
   *  auto-complétée à 'seed' — ce serait donc TOUJOURS désactivé si on réutilisait cette même
   *  condition (bug vérifié : le bouton restait grisé en permanence). Le serveur reste la seule
   *  source de vérité (voir destroyMenu()), qui refuse déjà explicitement si une partie du menu
   *  vit dans une section normale déjà validée. */
  removeMenu(line: OrderLine): void {
    if (!this.isMenuCarrierLine(line)) {
      return;
    }
    if (!confirm(`Retirer "${line.product?.name}" de la commande (avec tous ses composants) ?`)) {
      return;
    }

    this.error.set(null);
    this.orderLineService.removeMenu(line.id).subscribe({
      next: () => this.refreshOrder(),
      error: (err) =>
        this.error.set(err.error?.errors?.state?.[0] ?? err.error?.errors?.quantity?.[0] ?? 'Impossible de retirer ce menu.'),
    });
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
      // errors.lines : voir App\Support\StockManager — un stock insuffisant rejette la
      // validation sous cette clé, pas errors.state (réservée aux erreurs de cycle de section).
      error: (err) =>
        this.error.set(err.error?.errors?.state?.[0] ?? err.error?.errors?.lines?.[0] ?? "Impossible de valider cette section."),
    });
  }

  /** Valide en une fois toutes les sections encore "en attente" (voir validatableSections) — même
   *  action que validerSection() répétée manuellement section par section. Les requêtes partent
   *  en parallèle (forkJoin) : si l'une échoue (ex. stock insuffisant sur une seule section), les
   *  autres sections déjà validées côté serveur le restent — refreshOrder() dans les deux cas
   *  pour refléter cette progression partielle plutôt que de la laisser invisible derrière le
   *  message d'erreur. */
  validerToutesLesSections(): void {
    const sectionsToValidate = this.validatableSections();
    if (sectionsToValidate.length === 0) {
      return;
    }
    if (!confirm(`Valider ${sectionsToValidate.length} section(s) et les envoyer sur le kitchen display ?`)) {
      return;
    }

    this.error.set(null);
    forkJoin(sectionsToValidate.map((section) => this.orderSectionService.valider(section.id))).subscribe({
      next: () => this.refreshOrder(),
      error: (err) => {
        this.refreshOrder();
        this.error.set(err.error?.errors?.state?.[0] ?? err.error?.errors?.lines?.[0] ?? "Impossible de valider toutes les sections.");
      },
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
    // !line.priced : une ligne composant d'un menu (voir App\Support\MenuResolver côté API)
    // n'est jamais facturée séparément — l'inclure ferait apparaître son prix en plus de celui
    // de la ligne "porteuse" du menu dans cet aperçu, même bug que lineTotal() plus haut.
    const netQuantities = new Map<number, number>();
    for (const section of this.sections()) {
      for (const line of section.lines) {
        if (!line.priced) {
          continue;
        }
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
    this.ticketService.printThermal(ticket.id, this.activePrinterService.printer()?.id).subscribe({
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
