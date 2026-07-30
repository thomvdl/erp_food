import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api-config';
import { OrderSection } from './models/order.model';

@Injectable({ providedIn: 'root' })
export class OrderSectionService {
  private readonly http = inject(HttpClient);

  /**
   * "Quand c'est demandé, les postes peuvent marquer la section comme faite" (voir Readme.md) —
   * `lineIds` omis (vue "Tout") marque toutes les lignes ; sinon ne marque que les lignes
   * précisées, pour ne pas faire passer "faites" des lignes d'un autre poste/passe non concerné
   * par le filtre actif (voir kitchen-board.ts).
   */
  marquerFait(sectionId: number, lineIds?: number[]): Observable<OrderSection> {
    return this.http.post<OrderSection>(`${API_URL}/order-sections/${sectionId}/marquer-fait`, lineIds ? { line_ids: lineIds } : {});
  }

  /**
   * "Il faut envoyer section par section quand la section est marquée comme prête" (voir
   * Readme.md) — même principe que `marquerFait` : `lineIds` omis marque toutes les lignes,
   * sinon ne marque que les lignes du passe filtré (une section peut mélanger deux passes).
   */
  envoyer(sectionId: number, lineIds?: number[]): Observable<OrderSection> {
    return this.http.post<OrderSection>(`${API_URL}/order-sections/${sectionId}/envoyer`, lineIds ? { line_ids: lineIds } : {});
  }
}
