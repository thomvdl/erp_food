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

export interface Room {
  id: number;
  name: string;
  slug: string;
  /** Taille de la zone dessinable, même échelle que TableElement.pos_left/width — sert à mettre
   *  le plan à l'échelle sans barre de défilement (voir event-checkin.ts). */
  width: number;
  height: number;
  tables?: TableElement[];
}

export interface Client {
  id: number;
  firstname: string;
  lastname: string;
  email: string | null;
  phone: string | null;
}

/** Le "spectacle" générique (juste un nom) — chaque occurrence datée vit dans EventDate. */
export interface Event {
  id: number;
  name: string;
  slug: string;
  image_url: string | null;
}

export interface EventDate {
  id: number;
  date: string;
  start_hour: string;
  event_id: number;
  room_id: number | null;
  number_place_limit: number | null;
  event?: Event;
  room?: Room | null;
}

export interface EventTicket {
  id: number;
  event_date_id: number;
  client_id: number;
  table_id: number | null;
  validation_code: string;
  validated_at: string | null;
  event_date?: EventDate;
  client?: Client;
  table?: TableElement | null;
}

export interface ValidateEventTicketPayload {
  code: string;
  table_id?: number;
}
