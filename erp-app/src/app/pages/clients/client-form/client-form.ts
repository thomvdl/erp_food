import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClientService } from '../../../core/client.service';

@Component({
  selector: 'app-client-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './client-form.html',
})
export class ClientForm {
  private readonly clientService = inject(ClientService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  readonly firstname = signal('');
  readonly lastname = signal('');
  readonly email = signal('');
  readonly phone = signal('');

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.clientService.get(this.id).subscribe({
          next: (client) => {
            this.firstname.set(client.firstname);
            this.lastname.set(client.lastname);
            this.email.set(client.email ?? '');
            this.phone.set(client.phone ?? '');
          },
          error: () => this.error.set('Impossible de charger le client.'),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);
    this.saving.set(true);

    const payload = {
      firstname: this.firstname(),
      lastname: this.lastname(),
      email: this.email() || null,
      phone: this.phone() || null,
    };

    const request = this.isEdit() && this.id !== null ? this.clientService.update(this.id, payload) : this.clientService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/gestion/clients'),
      error: () => {
        this.saving.set(false);
        this.error.set("Impossible d'enregistrer le client.");
      },
    });
  }
}
