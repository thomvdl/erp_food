import { Component, inject, signal } from '@angular/core';
import { CompanyService } from '../../core/company.service';
import { Company } from '../../core/models/company.model';

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

  readonly company = signal<Company | null>(null);
  readonly year = new Date().getFullYear();

  constructor() {
    // Échec réseau : le footer reste vide plutôt que d'afficher des coordonnées obsolètes — pas
    // d'action utilisateur à débloquer ici, juste éviter l'erreur RxJS non gérée.
    this.companyService.get().subscribe({ next: (company) => this.company.set(company), error: () => {} });
  }
}
