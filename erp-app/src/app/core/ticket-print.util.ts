import { Ticket } from './models/ticket.model';

/**
 * Calculs partagés entre l'écran de confirmation post-paiement (POS - Restaurant, voir
 * order-builder.ts) et l'historique des tickets (ticket-list.ts, "réimpression") — extrait ici
 * plutôt que dupliqué, la répartition HT/TVA n'est pas un calcul trivial à reproduire deux fois.
 */

export function formatMoney(value: number | string): string {
  return Number(value).toFixed(2) + ' €';
}

export function ticketLineTotal(line: Ticket['sections'][number]['lines'][number]): number {
  return Number(line.unit_price) * line.quantity;
}

export function ticketSectionTotal(section: Ticket['sections'][number]): number {
  return section.lines.reduce((sum, line) => sum + ticketLineTotal(line), 0);
}

export function ticketTotal(ticket: Ticket): number {
  return ticket.sections.reduce((sum, section) => sum + ticketSectionTotal(section), 0);
}

export function ticketArticleCount(ticket: Ticket): number {
  return ticket.sections.reduce((sum, section) => sum + section.lines.reduce((lineSum, line) => lineSum + line.quantity, 0), 0);
}

/** Le prix produit est TTC — la TVA s'en extrait, elle ne s'ajoute pas dessus (même principe que pos-vente.ts::vatTotal). */
export function ticketTaxBreakdown(ticket: Ticket): { rate: number; ht: number; tva: number; ttc: number }[] {
  const ttcByRate = new Map<number, number>();

  for (const section of ticket.sections) {
    for (const line of section.lines) {
      const rate = Number(line.product?.tax?.value ?? 0);
      ttcByRate.set(rate, (ttcByRate.get(rate) ?? 0) + ticketLineTotal(line));
    }
  }

  return Array.from(ttcByRate.entries())
    .sort(([a], [b]) => a - b)
    .map(([rate, ttc]) => {
      const ht = rate > 0 ? ttc / (1 + rate / 100) : ttc;
      return { rate, ht, tva: ttc - ht, ttc };
    });
}

export function formatTicketDate(paidAt: string): string {
  const d = new Date(paidAt);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ticketSourceLabel(ticket: Ticket): string {
  switch (ticket.source) {
    case 'pos_restaurant':
      return 'POS Restaurant';
    case 'self_order':
      return 'Self-order (QR)';
    case 'kiosk':
      return 'Kiosque';
    case 'pos_vente_directe':
      return 'Vente directe';
    default:
      return '—';
  }
}
