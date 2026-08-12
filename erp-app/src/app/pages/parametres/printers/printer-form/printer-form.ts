import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PrinterService } from '../../../../core/printer.service';

@Component({
  selector: 'app-printer-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './printer-form.html',
})
export class PrinterForm {
  private readonly printerService = inject(PrinterService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);

  readonly name = signal('');
  readonly ipAddress = signal('');
  readonly port = signal(9100);
  readonly charsPerLine = signal<number | null>(null);
  readonly active = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.printerService.get(this.id).subscribe({
          next: (printer) => {
            this.name.set(printer.name);
            this.ipAddress.set(printer.ip_address);
            this.port.set(printer.port);
            this.charsPerLine.set(printer.chars_per_line);
            this.active.set(printer.active);
          },
          error: () => this.error.set("Impossible de charger l'imprimante."),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);

    const payload = {
      name: this.name(),
      ip_address: this.ipAddress(),
      port: this.port(),
      chars_per_line: this.charsPerLine(),
      active: this.active(),
    };
    const request =
      this.isEdit() && this.id !== null ? this.printerService.update(this.id, payload) : this.printerService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/imprimantes'),
      error: (err) => {
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.error.set((messages?.length ? messages.join(' ') : err.error?.message) ?? "Impossible d'enregistrer l'imprimante.");
      },
    });
  }
}
