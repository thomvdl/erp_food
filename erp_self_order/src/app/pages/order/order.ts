import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { SelfOrderService } from '../../core/self-order.service';
import { ProductStockEchoService } from '../../core/product-stock-echo.service';
import { SelfOrderContext, SelfOrderMenuChoice, SelfOrderMenuGroup, SelfOrderProduct } from '../../core/models/self-order.model';

interface CartLine {
  /** Identifiant purement client — plusieurs lignes peuvent partager le même product.id depuis
   *  l'introduction des menus (deux ajouts du même menu avec des choix différents restent deux
   *  lignes distinctes, voir addToCart/confirmAddMenu). */
  lineId: number;
  product: SelfOrderProduct;
  quantity: number;
  note: string;
  /** Choix du client pour un produit `is_menu` (voir App\Support\MenuResolver côté API) — absent
   *  pour un produit normal. */
  menuChoices?: SelfOrderMenuChoice[];
}

interface CategoryFilter {
  id: number | null;
  name: string;
  count: number;
  icon: string | null;
  image_url: string | null;
}

const PRODUCT_EMOJIS = ['🍽️', '🥗', '🍔', '🍰', '🥤', '🍕', '🍜', '🥐', '🍦', '🥙'];

/** En dessous de ce nombre restant, le stock affiché passe en couleur d'alerte — purement
 *  visuel, n'affecte ni la commande ni le calcul. */
const LOW_STOCK_THRESHOLD = 3;

/**
 * Mode QR (voir Readme du projet) : un client anonyme scanne le QR d'une table, arrive ici via
 * app.routes.ts (route générique `:qrToken`), compose sa commande, l'envoie. Pas d'authentification,
 * pas de paiement — un serveur valide/encaisse ensuite depuis erp-app > Gestion des commandes.
 */
@Component({
  selector: 'app-order',
  imports: [FormsModule],
  templateUrl: './order.html',
  styleUrl: './order.css',
})
export class Order {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly selfOrderService = inject(SelfOrderService);
  private readonly productStockEcho = inject(ProductStockEchoService);

  private qrToken = '';

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly context = signal<SelfOrderContext | null>(null);

  readonly cart = signal<CartLine[]>([]);
  private nextCartLineId = 1;
  readonly selectedCategoryId = signal<number | null>(null);
  readonly numberOfGuests = signal<number | null>(null);

  // --- Menu à choix (voir App\Support\MenuResolver côté API) — un menu ne s'ajoute jamais
  // directement au panier : cette modale bloque tant que chaque groupe n'a pas un nombre de
  // sélections entre min_choices et max_choices, même pattern que pos-vente.ts côté erp-app. ---
  readonly showMenuModal = signal<SelfOrderProduct | null>(null);
  readonly menuSelections = signal<Map<number, number[]>>(new Map());
  /** Nombre d'exemplaires de CETTE configuration (mêmes choix) à ajouter en un coup — voir
   *  confirmAddMenu(). */
  readonly menuQuantity = signal(1);

  readonly canConfirmMenu = computed(() => {
    const product = this.showMenuModal();
    return !!product && (product.menu_groups ?? []).every((group) => this.isMenuGroupValid(group));
  });

  /** Écran d'accueil en tuiles catégories avant la grille produit — même pattern que
   *  kiosk-order.ts (homeScreen). Vrai à l'arrivée sur le menu, puis basculé une fois pour la
   *  session (voir openCategory()) : contrairement au kiosque, un client self_order ne revient
   *  jamais "à l'accueil" entre deux commandes (une seule table, une seule visite). */
  readonly homeScreen = signal(true);
  readonly showCart = signal(false);
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly confirmedOrderId = signal<number | null>(null);

  readonly categories = computed<CategoryFilter[]>(() => {
    const byId = new Map<number | null, CategoryFilter>();
    for (const product of this.context()?.products ?? []) {
      const category = product.category ?? null;
      const key = category?.id ?? null;
      const existing = byId.get(key);
      if (existing) existing.count++;
      else byId.set(key, { id: key, name: category?.name ?? 'Autres', count: 1, icon: category?.icon ?? null, image_url: category?.image_url ?? null });
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly filteredProducts = computed(() => {
    const categoryId = this.selectedCategoryId();
    return (this.context()?.products ?? []).filter(
      (product) => categoryId === null || (product.category?.id ?? null) === categoryId,
    );
  });

  readonly cartCount = computed(() => this.cart().reduce((sum, line) => sum + line.quantity, 0));
  readonly cartTotal = computed(() => this.cart().reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0));

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const token = params.get('qrToken');
      if (!token) return;
      this.qrToken = token;
      this.loadContext();
    });

    // Voir App\Events\ProductStockUpdated — grise/dégrise une tuile produit en direct pendant que
    // le client compose sa commande, sans qu'il ait à re-scanner le QR pour recharger le menu.
    this.productStockEcho.listen();
    this.productStockEcho.stockUpdated.pipe(takeUntilDestroyed()).subscribe(({ productId, stockQuantity }) => {
      const context = this.context();
      if (!context?.products) return;
      this.context.set({
        ...context,
        products: context.products.map((product) =>
          product.id === productId ? { ...product, stock_quantity: stockQuantity } : product,
        ),
      });
    });
  }

  private loadContext(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.selfOrderService.getContext(this.qrToken).subscribe({
      next: (context) => {
        this.context.set(context);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(
          err.status === 404
            ? "Cette table n'existe pas ou n'est plus active — vérifiez le QR code."
            : 'Impossible de charger le menu — réessayez dans un instant.',
        );
      },
    });
  }

  productEmoji(product: SelfOrderProduct): string {
    const categoryId = product.category?.id ?? product.id;
    return PRODUCT_EMOJIS[categoryId % PRODUCT_EMOJIS.length];
  }

  /** Icône de la tuile catégorie — même logique que productEmoji() (stable par id), 🍽️ pour
   *  "Tout"/catégories sans id ("Autres"), pour rester cohérent visuellement avec les vignettes
   *  produit de la même catégorie. */
  categoryEmoji(categoryId: number | null): string {
    return categoryId === null ? '🍽️' : PRODUCT_EMOJIS[categoryId % PRODUCT_EMOJIS.length];
  }

  /** Tuile catégorie de l'accueil tapée (ou "Tout") — voir homeScreen. */
  openCategory(categoryId: number | null): void {
    this.selectedCategoryId.set(categoryId);
    this.homeScreen.set(false);
  }

  goHome(): void {
    this.homeScreen.set(true);
    this.selectedCategoryId.set(null);
  }

  /** Quitte cette table pour revenir à l'écran de scan (voir app.routes.ts, route ''/'' —
   *  home.ts). Distinct de goHome() ci-dessus, qui reste sur cette même table. */
  backToScan(): void {
    this.router.navigateByUrl('/');
  }

  /** Somme sur TOUTES les lignes de ce produit — un menu peut désormais apparaître dans plusieurs
   *  lignes distinctes (choix différents, voir CartLine.lineId). */
  quantityInCart(product: SelfOrderProduct): number {
    return this.cart()
      .filter((line) => line.product.id === product.id)
      .reduce((sum, line) => sum + line.quantity, 0);
  }

  /** `null` = stock non suivi, jamais affiché/décompté — même principe que pos-vente.ts côté
   *  erp-app. Mis à jour en temps réel par ProductStockEchoService (voir constructor()) à chaque
   *  vente ou réapprovisionnement ailleurs dans l'ERP. Purement indicatif : le staff qui encaisse
   *  (voir OrderController::pay côté API) reste la seule source de vérité, cette app n'a jamais
   *  géré de paiement elle-même. */
  remainingStock(product: SelfOrderProduct): number | null {
    return product.stock_quantity === null ? null : product.stock_quantity - this.quantityInCart(product);
  }

  isOutOfStock(product: SelfOrderProduct): boolean {
    const remaining = this.remainingStock(product);
    return remaining !== null && remaining <= 0;
  }

  /** Repère visuel (couleur d'alerte) en dessous de ce seuil — purement visuel. */
  isLowStock(product: SelfOrderProduct): boolean {
    const remaining = this.remainingStock(product);
    return remaining !== null && remaining > 0 && remaining <= LOW_STOCK_THRESHOLD;
  }

  formatMoney(value: number | string): string {
    return Number(value).toFixed(2) + ' €';
  }

  lineTotal(line: CartLine): number {
    return Number(line.product.price) * line.quantity;
  }

  addToCart(product: SelfOrderProduct): void {
    if (this.isOutOfStock(product)) {
      return;
    }

    if (product.is_menu) {
      this.openMenuModal(product);
      return;
    }

    const current = this.cart();
    const existing = current.find((line) => line.product.id === product.id && !line.menuChoices);
    if (existing) {
      this.cart.set(current.map((line) => (line.lineId === existing.lineId ? { ...line, quantity: line.quantity + 1 } : line)));
    } else {
      this.cart.set([...current, { lineId: this.nextCartLineId++, product, quantity: 1, note: '' }]);
    }
  }

  incrementLine(lineId: number): void {
    const current = this.cart();
    const existing = current.find((line) => line.lineId === lineId);
    if (!existing || this.isOutOfStock(existing.product)) return;
    this.cart.set(current.map((line) => (line.lineId === lineId ? { ...line, quantity: line.quantity + 1 } : line)));
  }

  decrementLine(lineId: number): void {
    const current = this.cart();
    const existing = current.find((line) => line.lineId === lineId);
    if (!existing) return;
    this.cart.set(
      existing.quantity <= 1
        ? current.filter((line) => line.lineId !== lineId)
        : current.map((line) => (line.lineId === lineId ? { ...line, quantity: line.quantity - 1 } : line)),
    );
  }

  removeLine(lineId: number): void {
    this.cart.set(this.cart().filter((line) => line.lineId !== lineId));
  }

  updateNote(lineId: number, note: string): void {
    this.cart.set(this.cart().map((line) => (line.lineId === lineId ? { ...line, note } : line)));
  }

  // --- Menu à choix ---

  openMenuModal(product: SelfOrderProduct): void {
    this.showMenuModal.set(product);
    this.menuSelections.set(new Map((product.menu_groups ?? []).map((group) => [group.id, []])));
    this.menuQuantity.set(1);
  }

  closeMenuModal(): void {
    this.showMenuModal.set(null);
    this.menuSelections.set(new Map());
    this.menuQuantity.set(1);
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

  toggleMenuOption(group: SelfOrderMenuGroup, productId: number): void {
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

  isMenuGroupValid(group: SelfOrderMenuGroup): boolean {
    const count = this.menuGroupSelection(group.id).length;
    return count >= group.min_choices && count <= group.max_choices;
  }

  confirmAddMenu(): void {
    const product = this.showMenuModal();
    if (!product || !this.canConfirmMenu()) return;

    const menuChoices: SelfOrderMenuChoice[] = Array.from(this.menuSelections().entries()).map(([menu_group_id, product_ids]) => ({
      menu_group_id,
      product_ids,
    }));

    const current = this.cart();
    const existing = current.find(
      (line) => line.product.id === product.id && JSON.stringify(line.menuChoices) === JSON.stringify(menuChoices),
    );

    if (existing) {
      this.cart.set(
        current.map((line) => (line.lineId === existing.lineId ? { ...line, quantity: line.quantity + this.menuQuantity() } : line)),
      );
    } else {
      this.cart.set([...current, { lineId: this.nextCartLineId++, product, quantity: this.menuQuantity(), note: '', menuChoices }]);
    }

    this.closeMenuModal();
  }

  /** Résumé lisible des choix d'une ligne de menu — même contenu que la note générée côté
   *  serveur (voir MenuResolver::resolve). */
  menuChoiceSummary(line: CartLine): string {
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

  submit(): void {
    if (this.cart().length === 0 || this.submitting()) return;
    this.submitting.set(true);
    this.submitError.set(null);

    this.selfOrderService
      .submit(this.qrToken, {
        number_of_guests: this.numberOfGuests(),
        lines: this.cart().map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
          note: line.note || null,
          menu_choices: line.menuChoices,
        })),
      })
      .subscribe({
        next: (res) => {
          this.submitting.set(false);
          this.confirmedOrderId.set(res.order_id);
          this.cart.set([]);
          this.showCart.set(false);
        },
        error: (err) => {
          this.submitting.set(false);
          const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
          this.submitError.set((messages?.length ? messages.join(' ') : err.error?.message) ?? "Impossible d'envoyer la commande.");
        },
      });
  }

  orderAgain(): void {
    this.confirmedOrderId.set(null);
    this.homeScreen.set(true);
    this.selectedCategoryId.set(null);
  }
}
