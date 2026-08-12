import { Injectable, computed, inject, signal } from '@angular/core';
import { KioskService } from './kiosk.service';
import { Printer } from './models/kiosk.model';

const PRINTER_KEY = 'erp-v2-kiosk-printer-id';

/**
 * "L'imprimante de ce kiosque" — choix local à CET appareil (localStorage), pas un réglage
 * serveur : plusieurs kiosques physiques doivent chacun pouvoir imprimer sur SA propre
 * imprimante thermique réseau (voir migration create_printers_table côté API, remplace l'IP
 * unique globale historique). Choisi une fois depuis l'écran de configuration (kiosk-setup),
 * même pattern que erp-app/core/active-printer.service.ts. Aucun fallback automatique : tant que
 * rien n'est choisi, l'impression thermique retombe côté serveur sur l'ancien réglage global.
 */
@Injectable({ providedIn: 'root' })
export class ActivePrinterService {
  private readonly kioskService = inject(KioskService);

  readonly printer = signal<Printer | null>(null);
  readonly printers = signal<Printer[]>([]);
  readonly activePrinters = computed(() => this.printers().filter((p) => p.active));
  readonly loaded = signal(false);

  constructor() {
    const storedId = this.readStoredPrinterId();

    this.kioskService.listPrinters().subscribe((printers) => {
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
