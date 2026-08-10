import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { SelfOrderService } from '../../core/self-order.service';
import { ProductStockEchoService } from '../../core/product-stock-echo.service';
import { SelfOrderContext, SelfOrderProduct } from '../../core/models/self-order.model';

interface CartLine {
  product: SelfOrderProduct;
  quantity: number;
  note: string;
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
  readonly selectedCategoryId = signal<number | null>(null);
  readonly numberOfGuests = signal<number | null>(null);

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

  quantityInCart(product: SelfOrderProduct): number {
    return this.cart().find((line) => line.product.id === product.id)?.quantity ?? 0;
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

    const current = this.cart();
    const existing = current.find((line) => line.product.id === product.id);
    if (existing) {
      this.cart.set(current.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)));
    } else {
      this.cart.set([...current, { product, quantity: 1, note: '' }]);
    }
  }

  decrementLine(product: SelfOrderProduct): void {
    const current = this.cart();
    const existing = current.find((line) => line.product.id === product.id);
    if (!existing) return;
    this.cart.set(
      existing.quantity <= 1
        ? current.filter((line) => line.product.id !== product.id)
        : current.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity - 1 } : line)),
    );
  }

  removeLine(product: SelfOrderProduct): void {
    this.cart.set(this.cart().filter((line) => line.product.id !== product.id));
  }

  updateNote(product: SelfOrderProduct, note: string): void {
    this.cart.set(this.cart().map((line) => (line.product.id === product.id ? { ...line, note } : line)));
  }

  submit(): void {
    if (this.cart().length === 0 || this.submitting()) return;
    this.submitting.set(true);
    this.submitError.set(null);

    this.selfOrderService
      .submit(this.qrToken, {
        number_of_guests: this.numberOfGuests(),
        lines: this.cart().map((line) => ({ product_id: line.product.id, quantity: line.quantity, note: line.note || null })),
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
