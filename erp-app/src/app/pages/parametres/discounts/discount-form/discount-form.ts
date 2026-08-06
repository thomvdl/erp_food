import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DiscountService } from '../../../../core/discount.service';
import { ProductService } from '../../../../core/product.service';
import { DiscountType } from '../../../../core/models/discount.model';
import { Product } from '../../../../core/models/product.model';
import { DatePicker } from '../../../../shared/date-picker/date-picker';

@Component({
  selector: 'app-discount-form',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePicker],
  templateUrl: './discount-form.html',
})
export class DiscountForm {
  private readonly discountService = inject(DiscountService);
  private readonly productService = inject(ProductService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  readonly products = signal<Product[]>([]);

  readonly code = signal('');
  readonly type = signal<DiscountType>('percentage');
  readonly value = signal<number | null>(null);
  readonly minimumTotal = signal<number | null>(null);
  readonly freeProductId = signal<number | null>(null);
  readonly startsAt = signal<string | null>(null);
  readonly endsAt = signal<string | null>(null);
  readonly active = signal(true);

  constructor() {
    this.productService.list().subscribe((products) => this.products.set(products.filter((p) => !p.is_combo)));

    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.discountService.get(this.id).subscribe({
          next: (discount) => {
            this.code.set(discount.code);
            this.type.set(discount.type);
            this.value.set(discount.value === null ? null : Number(discount.value));
            this.minimumTotal.set(discount.minimum_total === null ? null : Number(discount.minimum_total));
            this.freeProductId.set(discount.free_product_id);
            this.startsAt.set(discount.starts_at.slice(0, 10));
            this.endsAt.set(discount.ends_at.slice(0, 10));
            this.active.set(discount.active);
          },
          error: () => this.error.set('Impossible de charger la réduction.'),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);
    this.saving.set(true);

    const payload = {
      code: this.code().trim().toUpperCase(),
      type: this.type(),
      value: this.type() === 'free_product' ? null : this.value(),
      minimum_total: this.minimumTotal(),
      free_product_id: this.type() === 'free_product' ? this.freeProductId() : null,
      starts_at: this.startsAt()!,
      ends_at: this.endsAt()!,
      active: this.active(),
    };

    const request =
      this.isEdit() && this.id !== null
        ? this.discountService.update(this.id, payload)
        : this.discountService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/reductions'),
      error: (err) => {
        this.saving.set(false);
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.error.set((messages?.length ? messages.join(' ') : err.error?.message) ?? "Impossible d'enregistrer la réduction.");
      },
    });
  }
}
