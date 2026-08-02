import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { SelfOrderService } from '../../core/self-order.service';
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
}

const PRODUCT_EMOJIS = ['🍽️', '🥗', '🍔', '🍰', '🥤', '🍕', '🍜', '🥐', '🍦', '🥙'];

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
  private readonly selfOrderService = inject(SelfOrderService);

  private qrToken = '';

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly context = signal<SelfOrderContext | null>(null);

  readonly cart = signal<CartLine[]>([]);
  readonly selectedCategoryId = signal<number | null>(null);
  readonly numberOfGuests = signal<number | null>(null);

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
      else byId.set(key, { id: key, name: category?.name ?? 'Autres', count: 1 });
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

  quantityInCart(product: SelfOrderProduct): number {
    return this.cart().find((line) => line.product.id === product.id)?.quantity ?? 0;
  }

  formatMoney(value: number | string): string {
    return Number(value).toFixed(2) + ' €';
  }

  lineTotal(line: CartLine): number {
    return Number(line.product.price) * line.quantity;
  }

  addToCart(product: SelfOrderProduct): void {
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
  }
}
