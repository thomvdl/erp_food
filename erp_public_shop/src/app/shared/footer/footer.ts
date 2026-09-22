import { Component, computed, inject, signal } from '@angular/core';
import { CompanyService } from '../../core/company.service';
import { ShopService } from '../../core/shop.service';
import { Company } from '../../core/models/company.model';

/** Même ordre/mêmes clés que App\Support\ShopOpeningHours::DAY_KEYS côté API
 *  (Param CSV `shop_open_days`). */
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  mon: 'lun', tue: 'mar', wed: 'mer', thu: 'jeu', fri: 'ven', sat: 'sam', sun: 'dim',
};

/**
 * Affiché sur toutes les pages (voir app.html, hors router-outlet — pas de layout partagé dans
 * cette app). Coordonnées de l'établissement (voir CompanyService) — mêmes données que le pied
 * des emails clients, rien de sensible à protéger derrière une auth.
 */
@Component({
  selector: 'app-footer',
  imports: [],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
})
export class Footer {
  private readonly companyService = inject(CompanyService);
  private readonly shopService = inject(ShopService);

  readonly company = signal<Company | null>(null);
  readonly year = new Date().getFullYear();

  /** Réglages Paramètres > Réglages "shop_open_days"/"shop_open_at"/"shop_close_at" (voir
   *  App\Support\ShopOpeningHours côté API, déjà exposés par GET /shop/catalog pour le bandeau
   *  "fermé"/le créneau différé du checkout — réutilisés ici plutôt que dupliqués). null =
   *  dimension non configurée sur cette installation. */
  private readonly openDays = signal<string[] | null>(null);
  private readonly openAt = signal<string | null>(null);
  private readonly closeAt = signal<string | null>(null);

  /** "lun-dim : 10:00 - 22:00", ou juste les jours/heures configurés — null si rien n'est
   *  configuré (aucune ligne à afficher plutôt qu'un footer à moitié vide). */
  readonly openingHoursLabel = computed<string | null>(() => {
    const days = this.openDays();
    const openAt = this.openAt();
    const closeAt = this.closeAt();

    const daysLabel = days === null ? 'Tous les jours' : days.map((day) => DAY_LABELS[day as (typeof DAY_KEYS)[number]]).join(', ');
    const hoursLabel = openAt && closeAt ? `${openAt} - ${closeAt}` : null;

    if (days === null && !hoursLabel) return null;

    return hoursLabel ? `${daysLabel} : ${hoursLabel}` : daysLabel;
  });

  constructor() {
    // Échec réseau : le footer reste vide plutôt que d'afficher des coordonnées obsolètes — pas
    // d'action utilisateur à débloquer ici, juste éviter l'erreur RxJS non gérée.
    this.companyService.get().subscribe({ next: (company) => this.company.set(company), error: () => {} });
    this.shopService.getCatalog().subscribe({
      next: (catalog) => {
        this.openDays.set(catalog.open_days);
        this.openAt.set(catalog.open_at);
        this.closeAt.set(catalog.close_at);
      },
      error: () => {},
    });
  }
}
