import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TaxService } from '../../../../core/tax.service';

@Component({
  selector: 'app-tax-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './tax-form.html',
})
export class TaxForm {
  private readonly taxService = inject(TaxService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);

  readonly slug = signal('');
  readonly value = signal<number>(0);
  readonly error = signal<string | null>(null);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.taxService.get(this.id).subscribe({
          next: (tax) => {
            this.slug.set(tax.slug);
            this.value.set(Number(tax.value));
          },
          error: () => this.error.set('Impossible de charger la taxe.'),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);

    const payload = { slug: this.slug(), value: this.value() };
    const request =
      this.isEdit() && this.id !== null
        ? this.taxService.update(this.id, payload)
        : this.taxService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/taxes'),
      error: () => this.error.set("Impossible d'enregistrer la taxe."),
    });
  }
}
