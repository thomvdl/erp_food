import { Injectable, signal } from '@angular/core';
import { BoardFilter } from './models/board-filter.model';

const FILTER_KEY = 'erp-v2-kitchen-filter';

/**
 * Choix de poste/passe fait sur l'écran de sélection après connexion (voir poste-select.ts) —
 * un choix local à CET appareil (localStorage), pas un réglage serveur, même principe que
 * ActivePrinterService côté erp-app/erp_kiosk : un poste kitchen display dédié à une station de
 * cuisine (écran monté en cuisine, jamais déconnecté) doit garder son filtre d'un rechargement de
 * page à l'autre, indépendamment de ce qui est affiché sur un autre poste kitchen display.
 * kitchen-board.ts utilise directement ce service comme source de vérité du filtre actif —
 * sélectionner un filtre depuis sa propre barre (quand elle reste visible, voir Param
 * "kitchen_display_show_filter_bar") persiste donc aussi le choix, pas seulement l'écran dédié.
 */
@Injectable({ providedIn: 'root' })
export class ActiveKitchenFilterService {
  readonly filter = signal<BoardFilter>(this.readStored());

  setFilter(filter: BoardFilter): void {
    this.filter.set(filter);
    localStorage.setItem(FILTER_KEY, JSON.stringify(filter));
  }

  private readStored(): BoardFilter {
    const raw = localStorage.getItem(FILTER_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as BoardFilter;
    } catch {
      return null;
    }
  }
}
