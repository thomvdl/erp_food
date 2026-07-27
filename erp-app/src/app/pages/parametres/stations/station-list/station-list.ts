import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StationService } from '../../../../core/station.service';
import { Station } from '../../../../core/models/reference.model';

@Component({
  selector: 'app-station-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './station-list.html',
})
export class StationList {
  private readonly stationService = inject(StationService);

  readonly stations = signal<Station[]>([]);

  constructor() {
    this.refresh();
  }

  remove(station: Station): void {
    if (!confirm(`Supprimer la station "${station.name}" ?`)) {
      return;
    }

    this.stationService.remove(station.id).subscribe(() => this.refresh());
  }

  private refresh(): void {
    this.stationService.list().subscribe((stations) => this.stations.set(stations));
  }
}
