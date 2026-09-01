import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { KioskBannerService } from '../../../../core/kiosk-banner.service';
import { KioskBanner } from '../../../../core/models/kiosk-banner.model';

@Component({
  selector: 'app-kiosk-banner-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './kiosk-banner-list.html',
})
export class KioskBannerList {
  private readonly bannerService = inject(KioskBannerService);

  readonly banners = signal<KioskBanner[]>([]);
  readonly error = signal<string | null>(null);

  private draggedId: number | null = null;

  constructor() {
    this.refresh();
  }

  private refresh(): void {
    this.bannerService.list().subscribe((banners) => this.banners.set(banners));
  }

  onDragStart(event: DragEvent, banner: KioskBanner): void {
    this.draggedId = banner.id;
    event.dataTransfer?.setData('text/plain', String(banner.id));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  /** Réordonne localement pendant le survol pour un aperçu en direct — la position n'est
   *  persistée qu'au lâcher (voir onDragEnd/persistOrder), même pattern que category-list.ts. */
  onDragOver(event: DragEvent, banner: KioskBanner): void {
    event.preventDefault();

    if (this.draggedId === null || this.draggedId === banner.id) {
      return;
    }

    const current = this.banners();
    const fromIndex = current.findIndex((b) => b.id === this.draggedId);
    const toIndex = current.findIndex((b) => b.id === banner.id);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
      return;
    }

    const reordered = [...current];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    this.banners.set(reordered);
  }

  onDragEnd(): void {
    this.draggedId = null;
    this.persistOrder();
  }

  private persistOrder(): void {
    const updates = this.banners()
      .map((banner, position) => ({ banner, position }))
      .filter(({ banner, position }) => banner.position !== position)
      .map(({ banner, position }) => this.bannerService.update(banner.id, { position }));

    if (updates.length === 0) {
      return;
    }

    this.error.set(null);
    forkJoin(updates).subscribe({
      next: () => this.refresh(),
      error: () => {
        this.error.set("Impossible d'enregistrer le nouvel ordre.");
        this.refresh();
      },
    });
  }

  remove(banner: KioskBanner): void {
    if (!confirm(`Supprimer la bannière "${banner.title ?? 'sans titre'}" ?`)) {
      return;
    }

    this.error.set(null);
    this.bannerService.remove(banner.id).subscribe({
      next: () => this.refresh(),
      error: () => this.error.set('Impossible de supprimer la bannière.'),
    });
  }
}
