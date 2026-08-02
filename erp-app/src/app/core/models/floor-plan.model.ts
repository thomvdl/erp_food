/** 'table' = élément occupable (POS, check-in événement) ; 'wall'/'text' = purement décoratifs
 *  sur le plan (voir floor-plan-editor.ts) — les composants qui affichent le plan en lecture
 *  seule (table-select, order-builder transfert, event-dashboard, event-checkin) filtrent sur
 *  type === 'table' pour ne jamais les rendre cliquables/occupables. */
export type TableElementType = 'table' | 'wall' | 'text';

export interface TableElement {
  id: number;
  room_id: number;
  type: TableElementType;
  label: string | null;
  pos_left: number;
  pos_top: number;
  width: number;
  height: number;
  /** "Ne plus avoir la possibilité de supprimer... ajouter un champ active" (voir Readme.md). */
  active: boolean;
}

export type RoomType = 'restaurant' | 'event';

export interface Room {
  id: number;
  name: string;
  slug: string;
  type: RoomType;
  /** Taille de la zone dessinable, même échelle que TableElement.pos_left/width — sert à mettre
   *  le plan à l'échelle sans barre de défilement dans les écrans en lecture seule. */
  width: number;
  height: number;
  /** "Ne plus avoir la possibilité de supprimer... ajouter un champ active" (voir Readme.md). */
  active: boolean;
  tables?: TableElement[];
}
