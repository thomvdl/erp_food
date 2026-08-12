import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ProductService } from '../../core/product.service';
import { ProductCatalogService } from '../../core/product-catalog.service';
import { ProductStockEchoService } from '../../core/product-stock-echo.service';
import { PaymentMethodService } from '../../core/payment-method.service';
import { ClientService } from '../../core/client.service';
import { TicketService } from '../../core/ticket.service';
import { DiscountService } from '../../core/discount.service';
import { ActiveCashierService } from '../../core/active-cashier.service';
import { MenuGroup, Product, ProductComponent } from '../../core/models/product.model';
import { MenuChoice, MenuChoiceProductNote } from '../../core/models/menu-choice.model';
import { ProductCategory } from '../../core/models/catalog.model';
import { Client, PaymentMethod, Ticket } from '../../core/models/ticket.model';
import { ValidateDiscountResponse } from '../../core/models/discount.model';
import { TicketReceipt } from '../../shared/ticket-receipt/ticket-receipt';

interface CartLine {
  /** Identifiant purement client (pas un id serveur — ce panier n'est soumis qu'au paiement) —
   *  nécessaire car plusieurs lignes peuvent désormais partager le même product.id : deux ajouts
   *  du même menu avec des choix différents restent deux lignes distinctes (voir addToCart/
   *  confirmAddMenu), alors qu'avant cette fonctionnalité product.id suffisait à identifier une
   *  ligne de façon unique. */
  lineId: number;
  product: Product;
  quantity: number;
  /** Choix du client pour un produit `is_menu` (voir App\Support\MenuResolver côté API) — absent
   *  pour un produit normal/combo. */
  menuChoices?: MenuChoice[];
  /** Ingrédients retirés (voir Product.ingredients/modale de personnalisation) — résumé en texte
   *  libre ("Sans oignon, sans fromage"), envoyé tel quel au serveur (voir TicketController::store,
   *  jamais validé contre la vraie liste d'ingrédients, comme n'importe quelle autre note). */
  note?: string | null;
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

/** En dessous de ce nombre restant, le stock affiché passe en couleur d'alerte (voir
 *  isLowStock()) — purement visuel, n'affecte ni la vente ni le calcul. */
const LOW_STOCK_THRESHOLD = 3;

@Component({
  selector: 'app-pos-vente',
  standalone: true,
  imports: [FormsModule, RouterLink, TicketReceipt],
  templateUrl: './pos-vente.html',
})
export class PosVente {
  private readonly productService = inject(ProductService);
  private readonly catalogService = inject(ProductCatalogService);
  private readonly productStockEcho = inject(ProductStockEchoService);
  private readonly paymentMethodService = inject(PaymentMethodService);
  private readonly clientService = inject(ClientService);
  private readonly ticketService = inject(TicketService);
  private readonly discountService = inject(DiscountService);
  readonly activeCashierService = inject(ActiveCashierService);
  readonly authService = inject(AuthService);

  readonly allProducts = signal<Product[]>([]);
  /** Plusieurs catalogues peuvent être actifs à la fois pour le POS Vente directe, voir
   *  ProductCatalog.active_direct_sale. */
  readonly activeDirectSaleCatalogIds = signal<number[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);

  readonly searchTerm = signal('');
  readonly selectedCategoryId = signal<number | null>(null);

  readonly cart = signal<CartLine[]>([]);
  private nextCartLineId = 1;

  // --- Menu à choix (voir App\Support\MenuResolver côté API) — un menu ne s'ajoute jamais
  // directement au panier : cette modale bloque tant que chaque groupe n'a pas un nombre de
  // sélections entre min_choices et max_choices, même pattern que order-builder.ts. ---
  readonly showMenuModal = signal<Product | null>(null);
  readonly menuSelections = signal<Map<number, number[]>>(new Map());
  /** Nombre d'exemplaires de CETTE configuration (mêmes choix) à ajouter en un coup — voir
   *  confirmAddMenu(). */
  readonly menuQuantity = signal(1);
  /** Ingrédients retirés PAR produit choisi dans le menu (ex. le burger pris comme plat), pas
   *  pour le menu lui-même — clé "{groupId}:{productId}" (voir menuOptionKey()), remise à zéro à
   *  chaque ouverture/fermeture de la modale menu. Personnalisation ouverte via une modale
   *  imbriquée (showMenuOptionIngredientsModal ci-dessous), même pattern que showIngredientsModal
   *  mais appliquée à une option plutôt qu'au produit du panier. */
  readonly menuOptionExclusions = signal<Map<string, Set<number>>>(new Map());
  readonly showMenuOptionIngredientsModal = signal<{ group: MenuGroup; product: ProductComponent } | null>(null);
  readonly menuOptionExcludedIngredientIds = signal<Set<number>>(new Set());

  // --- Personnalisation des ingrédients (voir Product.ingredients) — modale ouverte au clic
  // uniquement si le produit a au moins un ingrédient retirable, sinon ajout direct comme avant. ---
  readonly showIngredientsModal = signal<Product | null>(null);
  readonly excludedIngredientIds = signal<Set<number>>(new Set());
  readonly ingredientsQuantity = signal(1);

  readonly canConfirmMenu = computed(() => {
    const product = this.showMenuModal();
    return !!product && (product.menu_groups ?? []).every((group) => this.isMenuGroupValid(group));
  });

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

  /** Code promo (voir DiscountCalculator) — appliqué explicitement ("Appliquer") plutôt qu'en
   *  live pendant la frappe : c'est une opération monétaire, pas une recherche. */
  readonly discountCodeInput = signal('');
  readonly appliedDiscount = signal<ValidateDiscountResponse | null>(null);
  readonly discountError = signal<string | null>(null);
  readonly checkingDiscount = signal(false);

  /** Points fidélité à utiliser en réduction (voir App\Support\LoyaltyPoints) — contrairement au
   *  code promo, pas de validation serveur séparée : la conversion points→€ est un calcul fixe
   *  (voir pointsAmount()), le serveur revalide/recalcule tout au moment du paiement comme pour
   *  le reste. Plafonné visuellement au solde du client sélectionné (voir le template). */
  readonly pointsToRedeemInput = signal(0);

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  /** Ticket payé affiché en plein écran après encaissement (voir order-builder.ts, même
   *  pattern) — reste posé le temps que le vendeur imprime, jusqu'à "Nouvelle vente". */
  readonly paidTicket = signal<Ticket | null>(null);
  readonly printingThermal = signal(false);
  readonly thermalPrinted = signal(false);

  private readonly clientSearch$ = new Subject<string>();

  /** Produits actifs rattachés à l'UN des catalogues actifs pour le POS Vente directe (union,
   *  pas un catalogue exclusif) — indépendant du POS Restaurant, voir
   *  ProductCatalog.active_direct_sale. */
  readonly availableProducts = computed(() => {
    const catalogIds = this.activeDirectSaleCatalogIds();
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

  readonly discountAmount = computed(() => this.appliedDiscount()?.amount_off ?? 0);

  /** Conversion fixe points→€ (100 points = 5€, voir App\Support\LoyaltyPoints::EUR_PER_POINT
   *  côté API) — juste pour l'affichage/le clavier, le serveur revalide tout au paiement. */
  readonly pointsAmount = computed(() => Math.round(this.pointsToRedeemInput() * 0.05 * 100) / 100);

  /** Total réellement dû après réduction (promo ET points, cumulables) — jamais négatif. Le
   *  serveur recalcule indépendamment au moment du paiement (voir TicketController::store) ;
   *  ceci ne sert qu'à l'affichage et au clavier de saisie du paiement. */
  readonly payableTotal = computed(() =>
    Math.max(Math.round((this.cartTotal() - this.discountAmount() - this.pointsAmount()) * 100) / 100, 0),
  );

  readonly paidTotal = computed(() => this.paymentLines().reduce((sum, line) => sum + line.value, 0));

  readonly remaining = computed(() => Math.round((this.payableTotal() - this.paidTotal()) * 100) / 100);

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
      .subscribe((catalogs) =>
        this.activeDirectSaleCatalogIds.set(catalogs.filter((c) => c.active_direct_sale).map((c) => c.id)),
      );
    this.paymentMethodService.list().subscribe((methods) => this.paymentMethods.set(methods));

    this.clientSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => this.clientService.search(query)),
      )
      .subscribe((results) => this.clientResults.set(results));

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

  formatMoney(value: number | string): string {
    return Number(value).toFixed(2) + ' €';
  }

  lineTotal(line: CartLine): number {
    return Number(line.product.price) * line.quantity;
  }

  /** Résumé lisible des choix d'une ligne de menu (ex. "Entrée : Salade — Plat : Steak") — pour
   *  affichage seulement, même contenu que la note générée côté serveur (voir MenuResolver::resolve). */
  menuChoiceSummary(line: CartLine): string {
    if (!line.menuChoices) {
      return '';
    }
    const groups = line.product.menu_groups ?? [];
    return line.menuChoices
      .map((choice) => {
        const group = groups.find((g) => g.id === choice.menu_group_id);
        if (!group) {
          return '';
        }
        const names = choice.product_ids
          .map((id) => group.options.find((option) => option.id === id)?.name)
          .filter((name): name is string => !!name);
        return names.length ? `${group.label} : ${names.join(', ')}` : '';
      })
      .filter(Boolean)
      .join(' — ');
  }

  /** Somme sur TOUTES les lignes de ce produit — un menu peut désormais apparaître dans plusieurs
   *  lignes distinctes (choix différents, voir CartLine.lineId), contrairement à avant où
   *  product.id identifiait une ligne unique. */
  quantityInCart(product: Product): number {
    return this.cart()
      .filter((line) => line.product.id === product.id)
      .reduce((sum, line) => sum + line.quantity, 0);
  }

  /** `null` = stock non suivi, jamais affiché/décompté (voir Product.stock_quantity). Tient
   *  compte de ce qui est déjà dans le panier (pas encore vendu, mais déjà "réservé" à l'écran) —
   *  mis à jour en temps réel par ProductStockEchoService (voir constructor()) à chaque vente ou
   *  réapprovisionnement, sur ce poste comme sur n'importe quel autre. */
  remainingStock(product: Product): number | null {
    return product.stock_quantity === null ? null : product.stock_quantity - this.quantityInCart(product);
  }

  isOutOfStock(product: Product): boolean {
    const remaining = this.remainingStock(product);
    return remaining !== null && remaining <= 0;
  }

  /** Repère visuel (couleur d'alerte) en dessous de ce seuil — n'affecte ni la vente ni le calcul,
   *  juste l'attention du vendeur avant que ça tombe à zéro. */
  isLowStock(product: Product): boolean {
    const remaining = this.remainingStock(product);
    return remaining !== null && remaining > 0 && remaining <= LOW_STOCK_THRESHOLD;
  }

  addToCart(product: Product): void {
    if (this.isOutOfStock(product)) {
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

    this.addLineToCart(product, null, 1);
  }

  /** Ajoute (ou fusionne avec) une ligne — factorisé entre addToCart() (pas de personnalisation)
   *  et confirmAddIngredients() (voir ci-dessous), les deux devant fusionner à l'identique par
   *  (product, note), pas seulement product : "Burger" et "Burger — Sans oignon" doivent rester
   *  deux lignes distinctes, jamais fusionnées silencieusement (perdrait la personnalisation). */
  private addLineToCart(product: Product, note: string | null, quantity: number): void {
    const current = this.cart();
    // !line.menuChoices : ne merge jamais avec une éventuelle ligne de menu (n'arrive pas pour
    // un produit normal, mais évite toute ambiguïté si l'id venait à coïncider).
    const existing = current.find((line) => line.product.id === product.id && !line.menuChoices && (line.note ?? null) === note);

    if (existing) {
      this.cart.set(current.map((line) => (line.lineId === existing.lineId ? { ...line, quantity: line.quantity + quantity } : line)));
    } else {
      this.cart.set([...current, { lineId: this.nextCartLineId++, product, quantity, note }]);
    }

    this.resetPaymentsOnCartChange();
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
   *  de ligne (voir confirmAddIngredients()). Vide si rien n'est décoché (aucune note ajoutée,
   *  comportement identique à avant cette fonctionnalité). */
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
    const product = this.showIngredientsModal();
    if (!product) {
      return;
    }

    const note = this.ingredientsNotePreview() || null;
    this.addLineToCart(product, note, this.ingredientsQuantity());
    this.closeIngredientsModal();
  }

  incrementCartLine(lineId: number): void {
    const current = this.cart();
    const existing = current.find((line) => line.lineId === lineId);
    if (!existing || this.isOutOfStock(existing.product)) {
      return;
    }

    this.cart.set(current.map((line) => (line.lineId === lineId ? { ...line, quantity: line.quantity + 1 } : line)));
    this.resetPaymentsOnCartChange();
  }

  decrementCartLine(lineId: number): void {
    const current = this.cart();
    const existing = current.find((line) => line.lineId === lineId);
    if (!existing) {
      return;
    }

    this.cart.set(
      existing.quantity <= 1
        ? current.filter((line) => line.lineId !== lineId)
        : current.map((line) => (line.lineId === lineId ? { ...line, quantity: line.quantity - 1 } : line)),
    );

    this.resetPaymentsOnCartChange();
  }

  removeCartLine(lineId: number): void {
    this.cart.set(this.cart().filter((line) => line.lineId !== lineId));
    this.resetPaymentsOnCartChange();
  }

  // --- Menu à choix ---

  openMenuModal(product: Product): void {
    this.showMenuModal.set(product);
    this.menuSelections.set(new Map((product.menu_groups ?? []).map((group) => [group.id, []])));
    this.menuQuantity.set(1);
    this.menuOptionExclusions.set(new Map());
  }

  closeMenuModal(): void {
    this.showMenuModal.set(null);
    this.menuSelections.set(new Map());
    this.menuQuantity.set(1);
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

  // --- Personnalisation d'un produit choisi À L'INTÉRIEUR d'un menu (ex. "le burger pris comme
  // plat, sans oignon") — modale imbriquée dans la modale menu, même mécanique que
  // showIngredientsModal (voir plus haut) mais sur une option de groupe plutôt que sur une ligne
  // de panier, et le résultat est stocké dans menuOptionExclusions plutôt qu'ajouté au panier. ---

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
   *  affiché sous sa pastille dans la modale menu, et réutilisé tel quel comme note de ligne côté
   *  serveur (voir confirmAddMenu() ci-dessous et App\Support\MenuResolver::resolve). */
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

  /** Fusionne avec une ligne déjà présente si elle porte EXACTEMENT les mêmes choix (comparaison
   *  simple par sérialisation — les groupes sont toujours itérés dans le même ordre, seul l'ordre
   *  interne d'un groupe à choix multiples pourrait exceptionnellement empêcher une fusion qui
   *  aurait pu avoir lieu ; sans conséquence sur le total, juste une ligne de plus à l'écran). */
  confirmAddMenu(): void {
    const product = this.showMenuModal();
    if (!product || !this.canConfirmMenu()) {
      return;
    }

    const menuChoices: MenuChoice[] = Array.from(this.menuSelections().entries()).map(([menu_group_id, product_ids]) => {
      const product_notes: MenuChoiceProductNote[] = product_ids
        .map((product_id) => ({ product_id, note: this.menuOptionNoteFor(menu_group_id, product_id) }))
        .filter((entry) => entry.note !== '');
      return product_notes.length > 0 ? { menu_group_id, product_ids, product_notes } : { menu_group_id, product_ids };
    });

    const current = this.cart();
    const existing = current.find(
      (line) => line.product.id === product.id && JSON.stringify(line.menuChoices) === JSON.stringify(menuChoices),
    );

    if (existing) {
      this.cart.set(
        current.map((line) => (line.lineId === existing.lineId ? { ...line, quantity: line.quantity + this.menuQuantity() } : line)),
      );
    } else {
      this.cart.set([...current, { lineId: this.nextCartLineId++, product, quantity: this.menuQuantity(), menuChoices }]);
    }

    this.resetPaymentsOnCartChange();
    this.closeMenuModal();
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
    this.pointsToRedeemInput.set(0);
  }

  clearClient(): void {
    this.selectedClient.set(null);
    this.pointsToRedeemInput.set(0);
  }

  /** Plafonne la saisie au solde du client sélectionné — le serveur revalide de toute façon
   *  (voir App\Support\LoyaltyPoints::amountOff), ceci n'évite qu'une saisie absurde à l'écran.
   *  Réinitialise les paiements déjà saisis : le montant dû vient de changer (voir
   *  resetPaymentsOnCartChange(), même raisonnement pour le code promo). */
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

  applyDiscountCode(): void {
    const code = this.discountCodeInput().trim().toUpperCase();
    if (!code || this.checkingDiscount()) {
      return;
    }

    this.checkingDiscount.set(true);
    this.discountError.set(null);

    this.discountService
      .validate(
        code,
        this.cart().map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
      )
      .subscribe({
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

  clearSale(): void {
    this.cart.set([]);
    this.paymentLines.set([]);
    this.selectedClient.set(null);
    this.error.set(null);
    this.appliedDiscount.set(null);
    this.discountCodeInput.set('');
    this.discountError.set(null);
    this.pointsToRedeemInput.set(0);
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
        discount_code: this.appliedDiscount()?.discount.code ?? null,
        points_redeemed: this.pointsToRedeemInput() > 0 ? this.pointsToRedeemInput() : null,
        lines: this.cart().map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
          note: line.note,
          menu_choices: line.menuChoices,
        })),
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

  /** Referme l'écran de confirmation pour repartir sur une vente vide — clearSale() a déjà vidé
   *  panier/paiements/client au moment du paiement, il ne reste que paidTicket à effacer. */
  newSale(): void {
    this.paidTicket.set(null);
    this.thermalPrinted.set(false);
  }

  /** Le panier a changé après validation d'un code (voir applyDiscountCode()) : le montant
   *  déjà calculé (amount_off) est potentiellement périmé (ex. pourcentage d'un total qui a
   *  changé) — mieux vaut forcer une revalidation explicite que d'afficher un montant faux. */
  private resetPaymentsOnCartChange(): void {
    if (this.paymentLines().length > 0) {
      this.paymentLines.set([]);
    }
    if (this.appliedDiscount()) {
      this.appliedDiscount.set(null);
      this.discountError.set('Le panier a changé — réapplique le code promo.');
    }
  }
}
