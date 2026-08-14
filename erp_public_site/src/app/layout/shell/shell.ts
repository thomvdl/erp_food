import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CompanyService } from '../../core/company.service';
import { Company } from '../../core/models/booking.model';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.html',
})
export class Shell {
  private readonly companyService = inject(CompanyService);

  readonly company = signal<Company | null>(null);
  readonly year = new Date().getFullYear();

  constructor() {
    this.companyService.get().subscribe({ next: (company) => this.company.set(company) });
  }
}
