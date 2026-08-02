import { Component, OnDestroy, OnInit, inject, input, output, signal } from '@angular/core';
import { TableElementService } from '../../../../core/table-element.service';
import { TableElement } from '../../../../core/models/floor-plan.model';

/**
 * Popup QR self-order d'une table — utilisée depuis floor-plan-editor (clic sur une table) et
 * table-list (vue liste). Factorisée ici plutôt que dupliquée : charger le blob PNG, le convertir
 * en data URI pour l'impression et gérer le cycle de vie de l'URL objet est un peu de logique non
 * triviale (voir printQrCode() dans user-form.ts, même pattern) pour la garder inline dans deux
 * pages du même app.
 */
@Component({
  selector: 'app-table-qr-modal',
  imports: [],
  templateUrl: './table-qr-modal.html',
  styleUrl: './table-qr-modal.css',
})
export class TableQrModal implements OnInit, OnDestroy {
  private readonly tableElementService = inject(TableElementService);

  readonly table = input.required<TableElement>();
  readonly closed = output<void>();

  readonly imageUrl = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private objectUrl: string | null = null;
  // Data URI (pas l'URL blob ci-dessus) pour la fenêtre d'impression : elle s'ouvre via
  // window.open('', '_blank') puis document.write, un contexte séparé où l'URL blob de la fenêtre
  // d'origine n'est pas garantie accessible — une data URI, si.
  private dataUri: string | null = null;

  ngOnInit(): void {
    this.tableElementService.getQrBlob(this.table().id).subscribe({
      next: (blob) => {
        this.objectUrl = URL.createObjectURL(blob);
        this.imageUrl.set(this.objectUrl);
        this.loading.set(false);

        const reader = new FileReader();
        reader.onload = () => (this.dataUri = reader.result as string);
        reader.readAsDataURL(blob);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Impossible de charger le QR code.');
      },
    });
  }

  print(): void {
    if (!this.dataUri) {
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="utf-8">
        <title>QR self-order — ${this.table().label ?? ''}</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; text-align: center; padding: 40px; }
          h1 { font-size: 20px; }
          p { color: #555; }
          img { width: 260px; height: 260px; margin-top: 16px; }
        </style>
      </head>
      <body>
        <h1>${this.table().label ?? ''}</h1>
        <p>Scannez pour commander</p>
        <img src="${this.dataUri}" alt="QR self-order" />
      </body>
      </html>
    `);
    printWindow.document.close();

    const img = printWindow.document.images[0];
    if (img.complete) {
      printWindow.print();
    } else {
      img.onload = () => printWindow.print();
    }
  }

  close(): void {
    this.closed.emit();
  }

  ngOnDestroy(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
  }
}
