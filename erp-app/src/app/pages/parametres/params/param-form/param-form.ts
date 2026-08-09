import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ParamService } from '../../../../core/param.service';

@Component({
  selector: 'app-param-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './param-form.html',
})
export class ParamForm {
  private readonly paramService = inject(ParamService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);

  readonly name = signal('');
  readonly value = signal('');
  readonly error = signal<string | null>(null);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.paramService.get(this.id).subscribe({
          next: (param) => {
            this.name.set(param.name);
            this.value.set(param.value ?? '');
          },
          error: () => this.error.set('Impossible de charger le réglage.'),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);

    const payload = { name: this.name(), value: this.value() || null };
    const request =
      this.isEdit() && this.id !== null
        ? this.paramService.update(this.id, payload)
        : this.paramService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/reglages'),
      error: () => this.error.set("Impossible d'enregistrer le réglage."),
    });
  }
}
