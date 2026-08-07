export type ReportPeriod = 'jour' | 'semaine' | 'mois';

export interface ReportPeriodStats {
  revenue: number;
  tickets_count: number;
}

export interface ReportBestSeller {
  product_id: number;
  product_name: string;
  quantity: number;
  revenue: number;
}

/** Réponse de GET /reports/summary (voir ReportController::summary côté API) — `current`/`previous`
 *  couvrent la même durée écoulée (voir ReportController::resolvePeriod), pas la période
 *  précédente entière : une comparaison en cours de période reste honnête (ex. le 7 du mois compare
 *  "1er au 7" à "1er au 7 du mois précédent"). */
export interface ReportSummary {
  period: ReportPeriod;
  current: ReportPeriodStats;
  previous: ReportPeriodStats;
  best_sellers: ReportBestSeller[];
}
