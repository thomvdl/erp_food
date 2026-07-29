import { User } from './user.model';
import { TicketPayment, PaymentMethod } from './ticket.model';

export interface CashSessionCount {
  id: number;
  cash_session_id: number;
  payment_method_id: number;
  /** Pour les espèces, inclut le fond d'ouverture ; pour les autres moyens, seulement les ventes. */
  expected_amount: number | string;
  counted_amount: number | string;
  discrepancy: number | string;
  payment_method?: PaymentMethod;
}

export interface CashSession {
  id: number;
  user_id: number;
  opening_amount: number | string;
  opened_at: string;
  /** Résumé "espèces" uniquement — voir counts pour le détail par moyen de paiement. */
  closing_amount: number | string | null;
  expected_amount: number | string | null;
  discrepancy: number | string | null;
  closed_at: string | null;
  closed_by_user_id: number | null;
  note: string | null;
  user?: User;
  closed_by?: User | null;
  /** Présents seulement sur la réponse de show() — pas sur list()/active(). */
  payments?: TicketPayment[];
  counts?: CashSessionCount[];
}

export interface OpenCashSessionPayload {
  user_id: number;
  opening_amount: number;
}

export interface CloseCashSessionPayload {
  counts: { payment_method_id: number; counted_amount: number }[];
  note?: string;
}
