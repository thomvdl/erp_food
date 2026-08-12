import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EventTicketTypeService } from '../../../../core/event-ticket-type.service';

@Component({
  selector: 'app-ticket-type-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './ticket-type-form.html',
})
export class TicketTypeForm {
  private readonly ticketTypeService = inject(EventTicketTypeService);
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
        this.ticketTypeService.get(this.id).subscribe({
          next: (ticketType) => {
            this.name.set(ticketType.name);
            this.active.set(ticketType.active);
          },
          error: () => this.error.set('Impossible de charger le type de place.'),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);

    const payload = { name: this.name(), active: this.active() };
    const request =
      this.isEdit() && this.id !== null ? this.ticketTypeService.update(this.id, payload) : this.ticketTypeService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/types-place'),
      error: () => this.error.set("Impossible d'enregistrer le type de place."),
    });
  }
}
