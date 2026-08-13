import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EventService } from '../../../core/event.service';

@Component({
  selector: 'app-event-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './event-form.html',
})
export class EventForm {
  private readonly eventService = inject(EventService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  readonly name = signal('');

  /** Voir category-form.ts — même pattern (upload = endpoint séparé, disponible seulement en édition). */
  readonly imageUrl = signal<string | null>(null);
  readonly uploadingImage = signal(false);
  readonly imageError = signal<string | null>(null);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.eventService.get(this.id).subscribe({
          next: (event) => {
            this.name.set(event.name);
            this.imageUrl.set(event.image_url);
          },
          error: () => this.error.set("Impossible de charger l'événement."),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);
    this.saving.set(true);

    const payload = { name: this.name() };

    const request =
      this.isEdit() && this.id !== null
        ? this.eventService.update(this.id, payload)
        : this.eventService.create(payload);

    request.subscribe({
      next: (event) => this.router.navigateByUrl(this.isEdit() ? '/gestion/evenements' : `/gestion/evenements/${event.id}`),
      error: (err) => {
        this.saving.set(false);
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.error.set(
          messages?.length ? messages.join(' ') : err.error?.message ?? "Impossible d'enregistrer l'événement.",
        );
      },
    });
  }

  /** Voir category-form.ts::onImageSelected — même logique. */
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.id === null) {
      return;
    }

    this.uploadingImage.set(true);
    this.imageError.set(null);

    this.eventService.uploadImage(this.id, file).subscribe({
      next: (updated) => {
        this.uploadingImage.set(false);
        this.imageUrl.set(updated.image_url);
        input.value = '';
      },
      error: () => {
        this.uploadingImage.set(false);
        this.imageError.set("Impossible d'envoyer l'image.");
        input.value = '';
      },
    });
  }

  removeImage(): void {
    if (this.id === null) {
      return;
    }

    this.uploadingImage.set(true);
    this.imageError.set(null);

    this.eventService.removeImage(this.id).subscribe({
      next: (updated) => {
        this.uploadingImage.set(false);
        this.imageUrl.set(updated.image_url);
      },
      error: () => {
        this.uploadingImage.set(false);
        this.imageError.set("Impossible de supprimer l'image.");
      },
    });
  }
}
