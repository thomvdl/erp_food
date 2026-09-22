import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ActiveKitchenFilterService } from '../../core/active-kitchen-filter.service';
import { StationService } from '../../core/station.service';
import { PasseService } from '../../core/passe.service';
import { Passe, Station } from '../../core/models/order.model';
import { BoardFilter } from '../../core/models/board-filter.model';

/**
 * Écran affiché juste après la connexion (voir login.ts, app.routes.ts) — "choisir son poste ou
 * son passe" avant d'arriver sur le board. Offre exactement les 5 mêmes choix que la barre de
 * filtre du board lui-même (voir kitchen-board.ts/BoardFilter) : ce n'est pas un filtre en plus,
 * c'est ce même filtre déplacé sur un écran dédié plein écran, plus lisible/tactile qu'une rangée
 * de pastilles pour un premier choix. Le choix est persisté par ActiveKitchenFilterService
 * (localStorage) et lu par kitchen-board.ts comme filtre initial — si la barre de filtre du board
 * est ensuite masquée (voir Param "kitchen_display_show_filter_bar", KitchenDisplayConfigService),
 * ce choix reste le seul moyen de définir ce que voit cet écran jusqu'à la prochaine connexion.
 */
@Component({
  selector: 'app-poste-select',
  standalone: true,
  imports: [],
  templateUrl: './poste-select.html',
  styleUrl: './poste-select.css',
})
export class PosteSelect {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly activeKitchenFilter = inject(ActiveKitchenFilterService);
  private readonly stationService = inject(StationService);
  private readonly passeService = inject(PasseService);

  readonly stations = signal<Station[]>([]);
  readonly passes = signal<Passe[]>([]);

  constructor() {
    this.stationService.list().subscribe((stations) => this.stations.set(stations));
    this.passeService.list().subscribe((passes) => this.passes.set(passes));
  }

  choose(filter: BoardFilter): void {
    this.activeKitchenFilter.setFilter(filter);
    this.router.navigateByUrl('/');
  }

  logout(): void {
    this.authService.logout().subscribe(() => this.router.navigateByUrl('/login'));
  }
}
