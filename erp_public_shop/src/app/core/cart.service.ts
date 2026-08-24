import { Injectable, computed, signal } from '@angular/core';
import { ShopMenuChoice, ShopProduct } from './models/shop.model';

export interface CartLine {
  /** Identifiant purement client — plusieurs lignes peuvent partager le même product.id (deux
   *  ajouts du même menu avec des choix différents restent deux lignes distinctes). */
  lineId: number;
  product: ShopProduct;
  quantity: number;
  note: string;
  /** Choix du client pour un produit `is_menu` (voir App\Support\MenuResolver côté API) — absent
   *  pour un produit normal. */
  menuChoices?: ShopMenuChoice[];
}

const STORAGE_KEY = 'erp_public_shop.cart';

/**
 * État partagé entre pages/catalog (composition du panier) et pages/checkout (récap + soumission)
 * — contrairement à erp_self_order (une seule page Order, jamais de navigation), la boutique
 * navigue entre plusieurs routes distinctes, le panier ne peut donc pas vivre dans un signal de
 * composant. Persisté en localStorage : si le client annule le paiement Stripe (retour sur
 * pages/confirmation avec status=cancel), le rechargement complet de page perdrait sinon le
 * panier composé — voir docblock de pages/confirmation.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private nextLineId = 1;
  readonly lines = signal<CartLine[]>(this.restore());

  readonly count = computed(() => this.lines().reduce((sum, line) => sum + line.quantity, 0));
  readonly total = computed(() => this.lines().reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0));

  /** Somme sur TOUTES les lignes de ce produit — un menu peut apparaître dans plusieurs lignes
   *  distinctes (choix différents, voir CartLine.lineId). */
  quantityOf(productId: number): number {
    return this.lines()
      .filter((line) => line.product.id === productId)
      .reduce((sum, line) => sum + line.quantity, 0);
  }

  /** Fusionne par (product, note) plutôt que par product seul : "Burger" et "Burger — Sans
   *  oignon" doivent rester deux lignes distinctes, jamais fusionnées silencieusement (perdrait
   *  la note). Jamais utilisé pour un produit `is_menu` (voir addMenuLine ci-dessous). */
  addLine(product: ShopProduct, note: string, quantity: number): void {
    const current = this.lines();
    const existing = current.find((line) => line.product.id === product.id && !line.menuChoices && line.note === note);
    if (existing) {
      this.setLines(current.map((line) => (line.lineId === existing.lineId ? { ...line, quantity: line.quantity + quantity } : line)));
    } else {
      this.setLines([...current, { lineId: this.nextLineId++, product, quantity, note }]);
    }
  }

  /** Fusionne par (product, menuChoices) — deux ajouts du même menu avec exactement les mêmes
   *  choix s'additionnent, des choix différents restent deux lignes. */
  addMenuLine(product: ShopProduct, menuChoices: ShopMenuChoice[], quantity: number): void {
    const current = this.lines();
    const existing = current.find(
      (line) => line.product.id === product.id && JSON.stringify(line.menuChoices) === JSON.stringify(menuChoices),
    );
    if (existing) {
      this.setLines(current.map((line) => (line.lineId === existing.lineId ? { ...line, quantity: line.quantity + quantity } : line)));
    } else {
      this.setLines([...current, { lineId: this.nextLineId++, product, quantity, note: '', menuChoices }]);
    }
  }

  incrementLine(lineId: number): void {
    this.setLines(this.lines().map((line) => (line.lineId === lineId ? { ...line, quantity: line.quantity + 1 } : line)));
  }

  decrementLine(lineId: number): void {
    const current = this.lines();
    const existing = current.find((line) => line.lineId === lineId);
    if (!existing) return;
    this.setLines(
      existing.quantity <= 1
        ? current.filter((line) => line.lineId !== lineId)
        : current.map((line) => (line.lineId === lineId ? { ...line, quantity: line.quantity - 1 } : line)),
    );
  }

  removeLine(lineId: number): void {
    this.setLines(this.lines().filter((line) => line.lineId !== lineId));
  }

  updateNote(lineId: number, note: string): void {
    this.setLines(this.lines().map((line) => (line.lineId === lineId ? { ...line, note } : line)));
  }

  clear(): void {
    this.setLines([]);
  }

  private setLines(lines: CartLine[]): void {
    this.lines.set(lines);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Stockage indisponible (navigation privée, quota...) — le panier reste fonctionnel pour
      // la session en cours, juste pas persisté au rechargement.
    }
  }

  private restore(): CartLine[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as CartLine[];
      this.nextLineId = parsed.reduce((max, line) => Math.max(max, line.lineId + 1), 1);
      return parsed;
    } catch {
      return [];
    }
  }
}
