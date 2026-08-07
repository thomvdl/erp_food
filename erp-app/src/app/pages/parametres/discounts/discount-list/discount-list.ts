import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DiscountService } from '../../../../core/discount.service';
import { Discount, DiscountType } from '../../../../core/models/discount.model';

const TYPE_LABELS: Record<DiscountType, string> = {
  percentage: 'Pourcentage',
  fixed_amount: 'Montant fixe',
  free_product: 'Produit gratuit',
};

@Component({
  selector: 'app-discount-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './discount-list.html',
})
export class DiscountList {
  private readonly discountService = inject(DiscountService);

  readonly discounts = signal<Discount[]>([]);

  constructor() {
    this.refresh();
  }

  typeLabel(discount: Discount): string {
    return TYPE_LABELS[discount.type];
  }

  valueLabel(discount: Discount): string {
    if (discount.type === 'percentage') {
      return `${discount.value} %`;
    }
    if (discount.type === 'fixed_amount') {
      return `${Number(discount.value).toFixed(2)} €`;
    }
    return discount.free_product?.name ?? '—';
  }

  formatDate(value: string): string {
    const [year, month, day] = value.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }

  private refresh(): void {
    this.discountService.list().subscribe((discounts) => this.discounts.set(discounts));
  }
}
