export interface TableElement {
  id: number;
  room_id: number;
  type: string;
  label: string | null;
  pos_left: number;
  pos_top: number;
  width: number;
  height: number;
}

export interface Room {
  id: number;
  name: string;
  slug: string;
  tables?: TableElement[];
}
