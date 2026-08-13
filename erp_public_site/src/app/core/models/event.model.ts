export interface Room {
  id: number;
  name: string;
}

/** Le "spectacle" générique (juste un nom) — chaque occurrence datée vit dans EventDate.
 *  Voir erp-api/app/Models/Event.php. */
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
  /** null = pas de limite de places pour cette occurrence (voir Readme.md). */
  number_place_limit: number | null;
  /** Nombre de places déjà vendues (voir EventDateController::index, withCount('tickets')). */
  tickets_count?: number;
  event?: Event;
  room?: Room | null;
}
