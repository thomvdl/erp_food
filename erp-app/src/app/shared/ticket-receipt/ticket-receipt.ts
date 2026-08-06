import { Component, Input, inject, signal } from '@angular/core';
import { CompanyService } from '../../core/company.service';
import { Company } from '../../core/models/company.model';
import { Ticket } from '../../core/models/ticket.model';
import {
  formatMoney,
  formatTicketDate,
  ticketArticleCount,
  ticketLineTotal,
  ticketNetTotal,
  ticketTaxBreakdown,
  ticketTotal,
} from '../../core/ticket-print.util';

/**
 * Reçu imprimable façon "vrai" ticket de caisse (voir Readme.md : "modifier le ticket de caisse,
 * s'inspirer de [référence]") — extrait en composant partagé, utilisé par order-builder.ts
 * (confirmation post-paiement POS - Restaurant), ticket-list.ts (réimpression depuis
 * l'historique) et ticket-detail.ts (détail d'un ticket) : 3 usages, dupliquer le markup une
 * 3ᵉ fois n'aurait plus de sens (voir core/ticket-print.util.ts pour les calculs, déjà partagés).
 * Le consommateur pose lui-même les classes `ticket-print ticket-receipt` sur la balise
 * <app-ticket-receipt> (styles globaux, voir styles.css) — nécessaire pour que le sélecteur CSS
 * d'impression (`.ticket-print, .ticket-print *`) matche correctement l'élément hôte.
 */
@Component({
  selector: 'app-ticket-receipt',
  standalone: true,
  templateUrl: './ticket-receipt.html',
  // Sans ceci l'élément hôte reste "display: inline" par défaut (élément custom non stylé) et
  // les `max-width`/`margin` posés par les consommateurs (order-builder, ticket-list,
  // ticket-detail) sont silencieusement ignorés.
  host: { style: 'display: block' },
})
export class TicketReceipt {
  private readonly companyService = inject(CompanyService);

  @Input({ required: true }) ticket!: Ticket;

  /** Coordonnées de l'établissement affichées en en-tête du reçu (voir CompanyController) —
   *  null tant que non chargées, le template retombe alors sur le nom du logiciel. */
  readonly company = signal<Company | null>(null);

  constructor() {
    this.companyService.get().subscribe((company) => this.company.set(company));
  }

  readonly formatMoney = formatMoney;
  readonly formatTicketDate = formatTicketDate;
  readonly ticketArticleCount = ticketArticleCount;
  readonly ticketTotal = ticketTotal;
  readonly ticketNetTotal = ticketNetTotal;
  readonly ticketLineTotal = ticketLineTotal;
  readonly ticketTaxBreakdown = ticketTaxBreakdown;
}
