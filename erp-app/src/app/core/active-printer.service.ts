import { Injectable, computed, inject, signal } from '@angular/core';
import { PrinterService } from './printer.service';
import { Printer } from './models/reference.model';

const PRINTER_KEY = 'erp-v2-printer-id';

/**
 * "L'imprimante de ce poste" — comme ActiveCashierService (le caissier), un choix local à CE
 * navigateur/appareil (localStorage), pas un réglage serveur : deux navigateurs ouverts sur la
 * même URL POS - Vente directe (ou deux kiosques) doivent pouvoir imprimer chacun sur SA propre
 * imprimante thermique réseau (voir migration create_printers_table, remplace l'IP unique
 * globale historique). Aucun fallback automatique (contrairement au caissier, pas d'équivalent
 * "utilisateur authentifié" pour une imprimante) : tant que rien n'est choisi, l'impression
 * thermique retombe côté serveur sur l'ancien réglage global (voir
 * App\Support\ThermalReceipt::print), donc ne bloque jamais un poste qui n'a pas encore configuré
 * la sienne.
 */
@Injectable({ providedIn: 'root' })
export class ActivePrinterService {
  private readonly printerService = inject(PrinterService);

  readonly printer = signal<Printer | null>(null);
  readonly printers = signal<Printer[]>([]);
  /** Une imprimante désactivée reste sélectionnable ailleurs (historique), mais ne doit plus
   *  apparaître dans le sélecteur — voir shell.html. */
  readonly activePrinters = computed(() => this.printers().filter((p) => p.active));
  readonly loaded = signal(false);

  constructor() {
    const storedId = this.readStoredPrinterId();

    this.printerService.list().subscribe((printers) => {
      this.printers.set(printers);
      this.printer.set(printers.find((p) => p.id === storedId) ?? null);
      this.loaded.set(true);
    });
  }

  setPrinter(printer: Printer | null): void {
    this.printer.set(printer);

    if (printer) {
      localStorage.setItem(PRINTER_KEY, String(printer.id));
    } else {
      localStorage.removeItem(PRINTER_KEY);
    }
  }

  private readStoredPrinterId(): number | null {
    const stored = localStorage.getItem(PRINTER_KEY);
    return stored ? Number(stored) : null;
  }
}
