import { Component, computed, inject, signal } from '@angular/core';
import { ReportService } from '../../core/report.service';
import { ReportBestSeller, ReportPeriod, ReportPeriodStats, ReportSummary } from '../../core/models/report.model';

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  jour: "Aujourd'hui",
  semaine: 'Cette semaine',
  mois: 'Ce mois-ci',
};

interface Delta {
  percent: number;
  up: boolean;
}

/**
 * Rapports (voir Readme.md) : comparaison à la période équivalente précédente (voir
 * ReportController::resolvePeriod côté API — pas la période précédente entière, la même durée
 * écoulée) + meilleures ventes. Page séparée du Dashboard, qui reste un aperçu "aujourd'hui".
 */
@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class Reports {
  private readonly reportService = inject(ReportService);

  readonly period = signal<ReportPeriod>('jour');
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly summary = signal<ReportSummary | null>(null);

  readonly periodLabel = computed(() => PERIOD_LABELS[this.period()]);

  readonly averageBasketCurrent = computed(() => this.averageBasket(this.summary()?.current ?? null));
  readonly averageBasketPrevious = computed(() => this.averageBasket(this.summary()?.previous ?? null));

  /** Object (pas un number brut) exprès : un delta de 0% est une valeur légitime, un template
   *  `@if (x; as y)` traiterait 0 comme "absent" puisque falsy en JS — un objet reste truthy. */
  readonly revenueDelta = computed<Delta | null>(() =>
    this.computeDelta(this.summary()?.current.revenue, this.summary()?.previous.revenue),
  );
  readonly ticketsDelta = computed<Delta | null>(() =>
    this.computeDelta(this.summary()?.current.tickets_count, this.summary()?.previous.tickets_count),
  );
  readonly basketDelta = computed<Delta | null>(() => this.computeDelta(this.averageBasketCurrent(), this.averageBasketPrevious()));

  readonly maxBestSellerRevenue = computed(() => {
    const revenues = this.summary()?.best_sellers.map((item) => item.revenue) ?? [];
    return revenues.length > 0 ? Math.max(...revenues) : 0;
  });

  constructor() {
    this.refresh();
  }

  selectPeriod(period: ReportPeriod): void {
    if (this.period() === period) {
      return;
    }
    this.period.set(period);
    this.refresh();
  }

  formatMoney(value: number): string {
    return value.toFixed(2) + ' €';
  }

  formatAbs(percent: number): string {
    return Math.abs(percent).toFixed(1);
  }

  barWidth(item: ReportBestSeller): number {
    const max = this.maxBestSellerRevenue();
    return max > 0 ? (item.revenue / max) * 100 : 0;
  }

  bestSellerTooltip(item: ReportBestSeller): string {
    return `${item.product_name} — ${this.formatMoney(item.revenue)} (${item.quantity} vendu${item.quantity > 1 ? 's' : ''})`;
  }

  private averageBasket(stats: ReportPeriodStats | null): number {
    if (!stats || stats.tickets_count === 0) {
      return 0;
    }
    return stats.revenue / stats.tickets_count;
  }

  private computeDelta(current: number | undefined, previous: number | undefined): Delta | null {
    if (current === undefined || previous === undefined || previous === 0) {
      return null;
    }
    const percent = ((current - previous) / previous) * 100;
    return { percent, up: percent >= 0 };
  }

  private refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.reportService.summary(this.period()).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Impossible de charger les rapports.');
      },
    });
  }
}
