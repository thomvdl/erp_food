import { Component, inject, signal } from '@angular/core';
import { CompanyService } from '../../core/company.service';
import { Company } from '../../core/models/company.model';

/**
 * Affiché sur toutes les pages (voir app.html, hors router-outlet — pas de layout partagé dans
 * cette app, contrairement à erp_public_site_event dont ce composant reprend le principe du
 * footer). Coordonnées de l'établissement (voir CompanyService) — mêmes données que le pied des
 * emails clients, rien de sensible à protéger derrière une auth.
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
    this.companyService.get().subscribe({ next: (company) => this.company.set(company) });
  }
}
