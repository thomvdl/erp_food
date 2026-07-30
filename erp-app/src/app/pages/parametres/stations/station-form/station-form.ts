import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StationService } from '../../../../core/station.service';
import { PasseService } from '../../../../core/passe.service';
import { Passe } from '../../../../core/models/reference.model';

@Component({
  selector: 'app-station-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './station-form.html',
})
export class StationForm {
  private readonly stationService = inject(StationService);
  private readonly passeService = inject(PasseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);

  readonly passes = signal<Passe[]>([]);
  readonly name = signal('');
  /** "C'est dans station qu'on doit pouvoir choisir dans quelle passe ça doit aller" (voir Readme.md) — optionnel. */
  readonly passeId = signal<number | null>(null);
  readonly active = signal(true);
  readonly error = signal<string | null>(null);

  /** "N'afficher que les éléments actifs" (voir Readme.md) — sans détacher silencieusement le
   *  passe déjà choisi sur cette station s'il vient d'être désactivé entretemps. */
  readonly selectablePasses = computed(() => this.passes().filter((passe) => passe.active || passe.id === this.passeId()));

  constructor() {
    this.passeService.list().subscribe((passes) => this.passes.set(passes));

    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.stationService.get(this.id).subscribe({
          next: (station) => {
            this.name.set(station.name);
            this.passeId.set(station.passe_id);
            this.active.set(station.active);
          },
          error: () => this.error.set('Impossible de charger la station.'),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);

    const payload = { name: this.name(), passe_id: this.passeId(), active: this.active() };
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
