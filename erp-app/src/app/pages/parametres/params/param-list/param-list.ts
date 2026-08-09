import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ParamService } from '../../../../core/param.service';
import { Param } from '../../../../core/models/reference.model';

@Component({
  selector: 'app-param-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './param-list.html',
})
export class ParamList {
  private readonly paramService = inject(ParamService);

  readonly params = signal<Param[]>([]);

  constructor() {
    this.refresh();
  }

  remove(param: Param): void {
    if (!confirm(`Supprimer le réglage "${param.name}" ?`)) {
      return;
    }

    this.paramService.remove(param.id).subscribe(() => this.refresh());
  }

  private refresh(): void {
    this.paramService.list().subscribe((params) => this.params.set(params));
  }
}
