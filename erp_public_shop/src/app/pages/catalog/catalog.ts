import { Component, afterRenderEffect, computed, inject, signal } from '@angular/core';
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

  /** Pastille active de la barre de catégories, suit la section en haut de la fenêtre pendant le
   *  défilement (voir le scrollspy dans le constructeur) — `null` = bucket "Autres". Comme dans
   *  erp_kiosk/pages/kiosk-order, tous les produits sont toujours affichés (plus de filtrage par
   *  catégorie) : la pastille tapée ne fait que défiler jusqu'à sa section (scrollToCategory). */
  readonly selectedCategoryId = signal<number | null>(null);
  readonly searchQuery = signal('');

  /** Coupe temporairement le scrollspy pendant un défilement déclenché par un clic
   *  (scrollToCategory) — même pattern que kiosk-order.ts, évite qu'une section traversée pendant
   *  l'animation smooth-scroll active brièvement sa propre pastille. */
  private scrollSpyMuted = false;

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

  /** Uniquement filtrés par la recherche — voir groupedCategories/categories ci-dessous, il n'y a
   *  plus de filtrage par catégorie (comme kiosk-order.ts). */
  readonly filteredProducts = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    return (this.catalog()?.products ?? []).filter((product) => !query || product.name.toLowerCase().includes(query));
  });

  /** Dérivées de filteredProducts (pas de tous les produits) : une catégorie sans résultat pour
   *  la recherche en cours disparaît de la barre de pastilles, cohérent avec groupedCategories qui
   *  n'affiche alors plus sa section. */
  readonly categories = computed<CategoryFilter[]>(() => {
    const byId = new Map<number | null, CategoryFilter>();
    for (const product of this.filteredProducts()) {
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

  /** Tous les produits (filtrés par la recherche), groupés par catégorie — même pattern que
   *  kiosk-order.ts::groupedCategories, une section par catégorie affichée à la suite au lieu
   *  d'une grille filtrée par catégorie sélectionnée. */
  readonly groupedCategories = computed(() => {
    const products = this.filteredProducts();
    return this.categories().map((category) => ({
      category,
      products: products.filter((product) => (product.category?.id ?? null) === category.id),
    }));
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

    // Scrollspy : la pastille active de la barre de catégories suit la section actuellement sous
    // la barre sticky pendant que la page défile — même logique que kiosk-order.ts, sauf que le
    // scroll se fait ici au niveau de la fenêtre (root: null) puisque cette page n'a pas de zone
    // scrollable interne dédiée (contrairement au kiosque, un appareil plein écran). onCleanup
    // déconnecte les observers précédents avant d'en recréer, et au destroy du composant.
    afterRenderEffect((onCleanup) => {
      this.groupedCategories();

      const header = document.querySelector('.shop-header') as HTMLElement | null;
      const nav = document.querySelector('.shop-categories') as HTMLElement | null;
      const sections = document.querySelectorAll('.shop-category-section');
      if (!header || !nav || sections.length === 0) return;

      // La barre de catégories colle juste sous l'en-tête (lui-même sticky), dont la hauteur
      // varie (flex-wrap sur mobile) — un ResizeObserver garde `top`/`--shop-sticky-offset`
      // synchronisés plutôt qu'une valeur codée en dur qui se déréglerait au redimensionnement/à
      // la rotation. La variable CSS pilote .shop-category-section { scroll-margin-top: … } :
      // scrollToCategory() peut alors utiliser le scrollIntoView natif (comme kiosk-order.ts) sans
      // recalculer lui-même la position d'arrivée.
      const syncStickyOffset = () => {
        const offset = header.getBoundingClientRect().height + nav.getBoundingClientRect().height;
        nav.style.top = `${header.getBoundingClientRect().height}px`;
        document.documentElement.style.setProperty('--shop-sticky-offset', `${offset}px`);
      };
      syncStickyOffset();
      const resizeObserver = new ResizeObserver(syncStickyOffset);
      resizeObserver.observe(header);
      resizeObserver.observe(nav);

      const observer = new IntersectionObserver(
        (entries) => {
          if (this.scrollSpyMuted) return;
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible.length === 0) return;

          const raw = (visible[0].target as HTMLElement).dataset['categoryId'];
          const categoryId = raw === 'other' ? null : Number(raw);
          if (this.selectedCategoryId() !== categoryId) this.selectedCategoryId.set(categoryId);
        },
        // N'observe que la bande sous la barre sticky (header + nav) — une section devient active
        // dès que son bord haut y entre, pas seulement quand elle occupe tout l'écran.
        { root: null, rootMargin: `-${header.getBoundingClientRect().height + nav.getBoundingClientRect().height}px 0px -60% 0px`, threshold: 0 },
      );

      sections.forEach((section) => observer.observe(section));
      onCleanup(() => {
        resizeObserver.disconnect();
        observer.disconnect();
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

  /** Identifiant d'ancre DOM d'une section catégorie — categoryId est null pour le bucket
   *  "Autres" (produits sans catégorie), voir `categories`/`groupedCategories` ci-dessus. */
  categoryAnchorId(categoryId: number | null): string {
    return `shop-category-${categoryId ?? 'other'}`;
  }

  /** Pastille de la barre de catégories — défile jusqu'à la section correspondante au lieu de
   *  filtrer la grille (voir groupedCategories). Le décalage sous la barre sticky (en-tête +
   *  pastilles) est géré par `scroll-margin-top` en CSS (voir --shop-sticky-offset, synchronisé
   *  dans le constructeur) plutôt que par un calcul manuel de position — scrollIntoView s'en sert
   *  nativement, même pattern que kiosk-order.ts::scrollToCategory. */
  scrollToCategory(categoryId: number | null): void {
    this.selectedCategoryId.set(categoryId);

    this.scrollSpyMuted = true;
    setTimeout(() => (this.scrollSpyMuted = false), 600);

    document.getElementById(this.categoryAnchorId(categoryId))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
