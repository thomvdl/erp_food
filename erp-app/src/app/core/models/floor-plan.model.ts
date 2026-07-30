export interface TableElement {
  id: number;
  room_id: number;
  type: string;
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
  /** "Ne plus avoir la possibilité de supprimer... ajouter un champ active" (voir Readme.md). */
  active: boolean;
  tables?: TableElement[];
}
