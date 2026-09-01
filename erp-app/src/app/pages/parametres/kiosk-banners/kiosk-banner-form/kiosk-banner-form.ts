import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { KioskBannerService } from '../../../../core/kiosk-banner.service';

@Component({
  selector: 'app-kiosk-banner-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './kiosk-banner-form.html',
})
export class KioskBannerForm {
  private readonly bannerService = inject(KioskBannerService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);

  readonly title = signal('');
  readonly subtitle = signal('');
  readonly position = signal<number | null>(null);
  readonly active = signal(true);
  readonly error = signal<string | null>(null);

  /** Voir category-form.ts — même pattern (image = endpoint séparé, disponible seulement en édition). */
  readonly imageUrl = signal<string | null>(null);
  readonly uploadingImage = signal(false);
  readonly imageError = signal<string | null>(null);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.bannerService.get(this.id).subscribe({
          next: (banner) => {
            this.title.set(banner.title ?? '');
            this.subtitle.set(banner.subtitle ?? '');
            this.position.set(banner.position);
            this.active.set(banner.active);
            this.imageUrl.set(banner.image_url);
          },
          error: () => this.error.set('Impossible de charger la bannière.'),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);

    const payload = {
      title: this.title().trim() || null,
      subtitle: this.subtitle().trim() || null,
      position: this.position() ?? undefined,
      active: this.active(),
    };
    const request =
      this.isEdit() && this.id !== null
        ? this.bannerService.update(this.id, payload)
        : this.bannerService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/bannieres-kiosque'),
      error: () => this.error.set("Impossible d'enregistrer la bannière."),
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

    this.bannerService.uploadImage(this.id, file).subscribe({
      next: (banner) => {
        this.uploadingImage.set(false);
        this.imageUrl.set(banner.image_url);
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

    this.bannerService.removeImage(this.id).subscribe({
      next: (banner) => {
        this.uploadingImage.set(false);
        this.imageUrl.set(banner.image_url);
      },
      error: () => {
        this.uploadingImage.set(false);
        this.imageError.set("Impossible de supprimer l'image.");
      },
    });
  }
}
