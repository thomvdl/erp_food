import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { CartService } from '../../core/cart.service';
import { ShopService } from '../../core/shop.service';
import { ProductStockEchoService } from '../../core/product-stock-echo.service';
import { ShopCatalog, ShopMenuChoice, ShopMenuChoiceProductNote, ShopMenuGroup, ShopMenuOption, ShopProduct } from '../../core/models/shop.model';
import { DeliveryAddress } from '../../shared/delivery-address/delivery-address';
import { CustomerLogin } from '../../shared/customer-login/customer-login';

interface CategoryFilter {
  id: number | null;
  name: string;
  count: number;
  /** Voir ShopCategory.icon/image_url — absents pour le bucket "Autres" (id null, produits sans
   *  catégorie, pas une vraie catégorie). */
  icon: string | null;
  image_url: string | null;
  /** Voir ShopCategory.position — MAX_SAFE_INTEGER pour "Autres" afin qu'il reste en dernier. */
  position: number;
}

const PRODUCT_EMOJIS = ['🍽️', '🥗', '🍔', '🍰', '🥤', '🍕', '🍜', '🥐', '🍦', '🥙'];

/** En dessous de ce nombre restant, le stock affiché passe en couleur d'alerte — purement
 *  visuel, n'affecte ni la commande ni le calcul. */
const LOW_STOCK_THRESHOLD = 3;

/**
 * Page d'accueil de la boutique en ligne — mise en page façon site marchand (en-tête recherche +
 * panier, bannière, filtres catégorie, grille de cartes produit avec bouton "Ajouter" visible ;
 * voir notion/eshop pour les gabarits de référence), contrairement au parcours en deux temps
 * (accueil en tuiles → grille plein écran) d'erp_self_order/pages/order dont la logique panier/
 * menu/ingrédients est par ailleurs directement reprise. Pas de table/qr_token (catalogue chargé
 * une seule fois au démarrage, pas par scan) ; le panier vit dans CartService (partagé avec
 * pages/checkout, voir son docblock) plutôt que dans un signal local ; "Envoyer la commande"
 * devient "Passer commande" qui navigue vers /checkout au lieu de soumettre directement (la
 * boutique est payante, contrairement au self-order).
 */
@Component({
  selector: 'app-catalog',
  imports: [FormsModule, DeliveryAddress, CustomerLogin],
  templateUrl: './catalog.html',
  styleUrl: './catalog.css',
})
export class Catalog {
  private readonly router = inject(Router);
  private readonly shopService = inject(ShopService);
  private readonly productStockEcho = inject(ProductStockEchoService);
  readonly cart = inject(CartService);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly catalog = signal<ShopCatalog | null>(null);

  /** `'all'` = pas de filtre catégorie (grille complète) ; `null` = bucket "Autres" (produits
   *  sans catégorie) — un sentinel dédié pour "tout" plutôt que réutiliser `null` évite l'ambiguïté
   *  avec l'id de ce bucket. */
  readonly selectedCategoryId = signal<number | null | 'all'>('all');
  readonly searchQuery = signal('');

  // --- Menu à choix (voir App\Support\MenuResolver côté API) — un menu ne s'ajoute jamais
  // directement au panier : cette modale bloque tant que chaque groupe n'a pas un nombre de
  // sélections entre min_choices et max_choices, même pattern que erp_self_order/pages/order. ---
  readonly showMenuModal = signal<ShopProduct | null>(null);
  readonly menuSelections = signal<Map<number, number[]>>(new Map());
  /** Nombre d'exemplaires de CETTE configuration (mêmes choix) à ajouter en un coup — voir
   *  confirmAddMenu(). */
  readonly menuQuantity = signal(1);
  /** Ingrédients retirés PAR produit choisi dans le menu — clé "{groupId}:{productId}". */
  readonly menuOptionExclusions = signal<Map<string, Set<number>>>(new Map());
  readonly showMenuOptionIngredientsModal = signal<{ group: ShopMenuGroup; product: ShopMenuOption } | null>(null);
  readonly menuOptionExcludedIngredientIds = signal<Set<number>>(new Set());

  readonly canConfirmMenu = computed(() => {
    const product = this.showMenuModal();
    return !!product && (product.menu_groups ?? []).every((group) => this.isMenuGroupValid(group));
  });

  // --- Personnalisation des ingrédients (voir Product.ingredients) ---
  readonly showIngredientsModal = signal<ShopProduct | null>(null);
  readonly excludedIngredientIds = signal<Set<number>>(new Set());
  readonly ingredientsQuantity = signal(1);

  readonly showCart = signal(false);

  readonly categories = computed<CategoryFilter[]>(() => {
    const byId = new Map<number | null, CategoryFilter>();
    for (const product of this.catalog()?.products ?? []) {
      const category = product.category ?? null;
      const key = category?.id ?? null;
      const existing = byId.get(key);
      if (existing) existing.count++;
      else
        byId.set(key, {
          id: key,
          name: category?.name ?? 'Autres',
          count: 1,
          icon: category?.icon ?? null,
          image_url: category?.image_url ?? null,
          position: category?.position ?? Number.MAX_SAFE_INTEGER,
        });
    }
    return Array.from(byId.values()).sort((a, b) => a.position - b.position);
  });

  readonly filteredProducts = computed(() => {
    const categoryId = this.selectedCategoryId();
    const query = this.searchQuery().trim().toLowerCase();
    return (this.catalog()?.products ?? []).filter((product) => {
      const categoryMatch = categoryId === 'all' || (product.category?.id ?? null) === categoryId;
      const searchMatch = !query || product.name.toLowerCase().includes(query);
      return categoryMatch && searchMatch;
    });
  });

  constructor() {
    this.loadCatalog();

    // Voir App\Events\ProductStockUpdated — grise/dégrise une tuile produit en direct pendant que
    // le client compose sa commande.
    this.productStockEcho.listen();
    this.productStockEcho.stockUpdated.pipe(takeUntilDestroyed()).subscribe(({ productId, stockQuantity }) => {
      const catalog = this.catalog();
      if (!catalog) return;
      this.catalog.set({
        ...catalog,
        products: catalog.products.map((product) => (product.id === productId ? { ...product, stock_quantity: stockQuantity } : product)),
      });
    });
  }

  private loadCatalog(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.shopService.getCatalog().subscribe({
      next: (catalog) => {
        this.catalog.set(catalog);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Impossible de charger le catalogue — réessayez dans un instant.');
      },
    });
  }

  productEmoji(product: ShopProduct): string {
    const categoryId = product.category?.id ?? product.id;
    return PRODUCT_EMOJIS[categoryId % PRODUCT_EMOJIS.length];
  }

  categoryEmoji(categoryId: number | null): string {
    return categoryId === null ? '🍽️' : PRODUCT_EMOJIS[categoryId % PRODUCT_EMOJIS.length];
  }

  selectCategory(categoryId: number | null | 'all'): void {
    this.selectedCategoryId.set(categoryId);
  }

  quantityInCart(product: ShopProduct): number {
    return this.cart.quantityOf(product.id);
  }

  /** `null` = stock non suivi, jamais affiché/décompté. Mis à jour en temps réel par
   *  ProductStockEchoService (voir constructor()). Purement indicatif : le serveur reste la seule
   *  source de vérité à la validation du panier. */
  remainingStock(product: ShopProduct): number | null {
    return product.stock_quantity === null ? null : product.stock_quantity - this.quantityInCart(product);
  }

  isOutOfStock(product: ShopProduct): boolean {
    const remaining = this.remainingStock(product);
    return remaining !== null && remaining <= 0;
  }

  isLowStock(product: ShopProduct): boolean {
    const remaining = this.remainingStock(product);
    return remaining !== null && remaining > 0 && remaining <= LOW_STOCK_THRESHOLD;
  }

  formatMoney(value: number | string): string {
    return Number(value).toFixed(2) + ' €';
  }

  lineTotal(line: { product: ShopProduct; quantity: number }): number {
    return Number(line.product.price) * line.quantity;
  }

  addToCart(product: ShopProduct): void {
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

    this.cart.addLine(product, '', 1);
  }

  private hasRemovableIngredients(product: ShopProduct): boolean {
    return (product.ingredients ?? []).some((ingredient) => ingredient.pivot.removable);
  }

  // --- Modale de personnalisation (voir Product.ingredients) ---

  openIngredientsModal(product: ShopProduct): void {
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

    this.cart.addLine(product, this.ingredientsNotePreview(), this.ingredientsQuantity());
    this.closeIngredientsModal();
  }

  incrementLine(lineId: number): void {
    this.cart.incrementLine(lineId);
  }

  decrementLine(lineId: number): void {
    this.cart.decrementLine(lineId);
  }

  removeLine(lineId: number): void {
    this.cart.removeLine(lineId);
  }

  updateNote(lineId: number, note: string): void {
    this.cart.updateNote(lineId, note);
  }

  // --- Menu à choix ---

  openMenuModal(product: ShopProduct): void {
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

  toggleMenuOption(group: ShopMenuGroup, productId: number): void {
    const current = this.menuGroupSelection(group.id);
    const next = new Map(this.menuSelections());

    if (group.max_choices === 1) {
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

  isMenuGroupValid(group: ShopMenuGroup): boolean {
    const count = this.menuGroupSelection(group.id).length;
    return count >= group.min_choices && count <= group.max_choices;
  }

  private menuOptionKey(groupId: number, productId: number): string {
    return `${groupId}:${productId}`;
  }

  optionHasRemovableIngredients(option: ShopMenuOption): boolean {
    return (option.ingredients ?? []).some((ingredient) => ingredient.pivot.removable);
  }

  openMenuOptionIngredientsModal(group: ShopMenuGroup, option: ShopMenuOption): void {
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
    if (!current) return '';
    const excluded = this.menuOptionExcludedIngredientIds();
    return (current.product.ingredients ?? [])
      .filter((ingredient) => excluded.has(ingredient.id))
      .map((ingredient) => `Sans ${ingredient.name}`)
      .join(', ');
  }

  confirmMenuOptionIngredients(): void {
    const current = this.showMenuOptionIngredientsModal();
    if (!current) return;

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

  menuOptionNoteFor(groupId: number, productId: number): string {
    const excluded = this.menuOptionExclusions().get(this.menuOptionKey(groupId, productId));
    if (!excluded || excluded.size === 0) return '';
    const group = (this.showMenuModal()?.menu_groups ?? []).find((g) => g.id === groupId);
    const option = group?.options.find((o) => o.id === productId);
    return (option?.ingredients ?? [])
      .filter((ingredient) => excluded.has(ingredient.id))
      .map((ingredient) => `Sans ${ingredient.name}`)
      .join(', ');
  }

  confirmAddMenu(): void {
    const product = this.showMenuModal();
    if (!product || !this.canConfirmMenu()) return;

    const menuChoices: ShopMenuChoice[] = Array.from(this.menuSelections().entries()).map(([menu_group_id, product_ids]) => {
      const product_notes: ShopMenuChoiceProductNote[] = product_ids
        .map((product_id) => ({ product_id, note: this.menuOptionNoteFor(menu_group_id, product_id) }))
        .filter((entry) => entry.note !== '');
      return product_notes.length > 0 ? { menu_group_id, product_ids, product_notes } : { menu_group_id, product_ids };
    });

    this.cart.addMenuLine(product, menuChoices, this.menuQuantity());
    this.closeMenuModal();
  }

  /** Résumé lisible des choix d'une ligne de menu — même contenu que la note générée côté
   *  serveur (voir MenuResolver::resolve). */
  menuChoiceSummary(line: { product: ShopProduct; menuChoices?: ShopMenuChoice[] }): string {
    if (!line.menuChoices) return '';
    const groups = line.product.menu_groups ?? [];
    return line.menuChoices
      .map((choice) => {
        const group = groups.find((g) => g.id === choice.menu_group_id);
        if (!group) return '';
        const names = choice.product_ids
          .map((id) => group.options.find((option) => option.id === id)?.name)
          .filter((name): name is string => !!name);
        return names.length ? `${group.label} : ${names.join(', ')}` : '';
      })
      .filter(Boolean)
      .join(' — ');
  }

  goToCheckout(): void {
    if (this.cart.lines().length === 0) return;
    this.showCart.set(false);
    this.router.navigateByUrl('/checkout');
  }
}
