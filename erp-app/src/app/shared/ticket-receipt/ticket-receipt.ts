import { Component, Input } from '@angular/core';
import { Ticket } from '../../core/models/ticket.model';
import {
  formatMoney,
  formatTicketDate,
  ticketArticleCount,
  ticketLineTotal,
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
  @Input({ required: true }) ticket!: Ticket;

  readonly formatMoney = formatMoney;
  readonly formatTicketDate = formatTicketDate;
  readonly ticketArticleCount = ticketArticleCount;
  readonly ticketTotal = ticketTotal;
  readonly ticketLineTotal = ticketLineTotal;
  readonly ticketTaxBreakdown = ticketTaxBreakdown;
}
