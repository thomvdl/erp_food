import { Component, Input } from '@angular/core';
import { Ticket } from '../../core/models/kiosk.model';
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
 * Repris d'erp-app/shared/ticket-receipt (même markup/logique) — reçu imprimable affiché après
 * paiement au kiosque (voir pages/kiosk-order). Le consommateur pose lui-même les classes
 * `ticket-print ticket-receipt` sur la balise <app-ticket-receipt> (styles globaux, voir
 * styles.css copié depuis erp-app) — nécessaire pour que le sélecteur CSS d'impression
 * (`.ticket-print, .ticket-print *`) matche correctement l'élément hôte.
 */
@Component({
  selector: 'app-ticket-receipt',
  standalone: true,
  templateUrl: './ticket-receipt.html',
  host: { style: 'display: block' },
})
export class TicketReceipt {
  @Input({ required: true }) ticket!: Ticket;

  readonly formatMoney = formatMoney;
  readonly formatTicketDate = formatTicketDate;
  readonly ticketArticleCount = ticketArticleCount;
  readonly ticketTotal = ticketTotal;
  readonly ticketNetTotal = ticketNetTotal;
  readonly ticketLineTotal = ticketLineTotal;
  readonly ticketTaxBreakdown = ticketTaxBreakdown;
}
