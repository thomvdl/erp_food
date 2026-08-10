import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePicker } from '../../shared/date-picker/date-picker';
import { MonthPicker } from '../../shared/month-picker/month-picker';
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
  imports: [FormsModule, DatePicker, MonthPicker],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class Reports {
  private readonly reportService = inject(ReportService);

  readonly period = signal<ReportPeriod>('jour');
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly summary = signal<ReportSummary | null>(null);

  // --- Export comptable (voir AccountingExportController côté API) — période libre, distincte
  // des onglets jour/semaine/mois ci-dessus qui servent uniquement aux stats comparatives. Défaut
  // au mois en cours : le cas d'usage le plus courant ("export du mois pour le comptable"). ---
  readonly exportFrom = signal(Reports.startOfMonth());
  readonly exportTo = signal(Reports.today());
  /** Raccourci "un mois entier" au-dessus de Du/Au (voir setExportMonth ci-dessous) — les deux
   *  champs de date restent la source de vérité pour l'appel API, ce sélecteur ne fait que les
   *  préremplir en un clic plutôt que de dupliquer la logique d'export pour un cas particulier. */
  readonly exportMonth = signal(Reports.currentMonth());
  readonly exportingCsv = signal(false);
  readonly exportingPdf = signal(false);
  readonly exportError = signal<string | null>(null);

  readonly exportRangeValid = computed(() => {
    const from = this.exportFrom();
    const to = this.exportTo();
    return !!from && !!to && from <= to;
  });

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

  setExportFrom(value: string | null): void {
    this.exportFrom.set(value ?? '');
  }

  setExportTo(value: string | null): void {
    this.exportTo.set(value ?? '');
  }

  /** `value` au format `YYYY-MM` (voir app-month-picker) — préremplit Du/Au sur le mois entier
   *  plutôt que de forcer une saisie manuelle jour par jour pour le cas le plus courant ("export
   *  du mois pour le comptable"). */
  setExportMonth(value: string | null): void {
    this.exportMonth.set(value ?? '');
    if (!value) {
      return;
    }
    const [year, month] = value.split('-').map(Number);
    this.exportFrom.set(Reports.toDateStr(new Date(year, month - 1, 1)));
    this.exportTo.set(Reports.toDateStr(new Date(year, month, 0)));
  }

  downloadCsv(): void {
    if (!this.exportRangeValid() || this.exportingCsv()) {
      return;
    }
    this.exportingCsv.set(true);
    this.exportError.set(null);
    this.reportService.exportCsv(this.exportFrom(), this.exportTo()).subscribe({
      next: (blob) => {
        this.exportingCsv.set(false);
        this.triggerDownload(blob, `export-comptable_${this.exportFrom()}_${this.exportTo()}.csv`);
      },
      error: () => {
        this.exportingCsv.set(false);
        this.exportError.set("Impossible de générer l'export CSV.");
      },
    });
  }

  downloadPdf(): void {
    if (!this.exportRangeValid() || this.exportingPdf()) {
      return;
    }
    this.exportingPdf.set(true);
    this.exportError.set(null);
    this.reportService.exportPdf(this.exportFrom(), this.exportTo()).subscribe({
      next: (blob) => {
        this.exportingPdf.set(false);
        this.triggerDownload(blob, `export-comptable_${this.exportFrom()}_${this.exportTo()}.pdf`);
      },
      error: () => {
        this.exportingPdf.set(false);
        this.exportError.set('Impossible de générer le PDF.');
      },
    });
  }

  /** Même pattern que le téléchargement de QR code (table-qr-modal.ts) côté objet blob, mais ici
   *  pour déclencher un vrai téléchargement de fichier plutôt qu'un affichage — pas d'idiome
   *  existant à réutiliser pour ça ailleurs dans le projet. */
  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private static toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private static startOfMonth(): string {
    const d = new Date();
    return Reports.toDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  private static today(): string {
    return Reports.toDateStr(new Date());
  }

  private static currentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
