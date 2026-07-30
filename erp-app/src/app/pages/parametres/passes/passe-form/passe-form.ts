import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PasseService } from '../../../../core/passe.service';

@Component({
  selector: 'app-passe-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './passe-form.html',
})
export class PasseForm {
  private readonly passeService = inject(PasseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);

  readonly name = signal('');
  readonly active = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.passeService.get(this.id).subscribe({
          next: (passe) => {
            this.name.set(passe.name);
            this.active.set(passe.active);
          },
          error: () => this.error.set('Impossible de charger le passe.'),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);

    const payload = { name: this.name(), active: this.active() };
    const request = this.isEdit() && this.id !== null ? this.passeService.update(this.id, payload) : this.passeService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/passes'),
      error: () => this.error.set("Impossible d'enregistrer le passe."),
    });
  }
}
