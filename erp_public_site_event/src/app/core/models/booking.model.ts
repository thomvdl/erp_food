/** Voir App\Http\Controllers\Api\PublicBookingController::store côté API — payload minimal
 *  saisi par le visiteur, pas de client_id (le client n'existe pas encore forcément). */
export interface CreateBookingPayload {
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
  number_of_guests: number;
  type: 'breakfast' | 'lunch' | 'dinner';
  date: string;
  hour: string;
}

export interface Booking {
  id: number;
  date: string;
  hour: string;
  type: string;
  number_of_guests: number;
  validated_at: string | null;
}

export interface Company {
  name: string | null;
  address: string | null;
  phone: string | null;
}
