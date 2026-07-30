import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PasseService } from '../../../../core/passe.service';
import { Passe } from '../../../../core/models/reference.model';

@Component({
  selector: 'app-passe-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './passe-list.html',
})
export class PasseList {
  private readonly passeService = inject(PasseService);

  readonly passes = signal<Passe[]>([]);

  constructor() {
    this.refresh();
  }

  private refresh(): void {
    this.passeService.list().subscribe((passes) => this.passes.set(passes));
  }
}
