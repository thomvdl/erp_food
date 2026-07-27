import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StationService } from '../../../../core/station.service';

@Component({
  selector: 'app-station-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './station-form.html',
})
export class StationForm {
  private readonly stationService = inject(StationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);

  readonly name = signal('');
  readonly error = signal<string | null>(null);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.stationService.get(this.id).subscribe({
          next: (station) => this.name.set(station.name),
          error: () => this.error.set('Impossible de charger la station.'),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);

    const payload = { name: this.name() };
    const request =
      this.isEdit() && this.id !== null
        ? this.stationService.update(this.id, payload)
        : this.stationService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/stations'),
      error: () => this.error.set("Impossible d'enregistrer la station."),
    });
  }
}
