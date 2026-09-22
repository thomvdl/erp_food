import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';

export interface KitchenDisplayConfig {
  filter_bar_visible: boolean;
}

/** Réglage "kitchen_display_show_filter_bar" (Paramètres > Réglages côté erp-app), voir
 *  KitchenDisplayController::config. */
@Injectable({ providedIn: 'root' })
export class KitchenDisplayConfigService {
  private readonly http = inject(HttpClient);

  get(): Observable<KitchenDisplayConfig> {
    return this.http.get<KitchenDisplayConfig>(`${API_URL}/kitchen-display-config`);
  }
}
