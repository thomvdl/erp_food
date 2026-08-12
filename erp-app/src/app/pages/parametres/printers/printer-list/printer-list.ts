import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PrinterService } from '../../../../core/printer.service';
import { Printer } from '../../../../core/models/reference.model';

@Component({
  selector: 'app-printer-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './printer-list.html',
})
export class PrinterList {
  private readonly printerService = inject(PrinterService);

  readonly printers = signal<Printer[]>([]);

  constructor() {
    this.refresh();
  }

  private refresh(): void {
    this.printerService.list().subscribe((printers) => this.printers.set(printers));
  }
}
