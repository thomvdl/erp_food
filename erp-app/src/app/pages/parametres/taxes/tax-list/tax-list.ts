import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TaxService } from '../../../../core/tax.service';
import { Tax } from '../../../../core/models/reference.model';

@Component({
  selector: 'app-tax-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './tax-list.html',
})
export class TaxList {
  private readonly taxService = inject(TaxService);

  readonly taxes = signal<Tax[]>([]);

  constructor() {
    this.refresh();
  }

  private refresh(): void {
    this.taxService.list().subscribe((taxes) => this.taxes.set(taxes));
  }
}
