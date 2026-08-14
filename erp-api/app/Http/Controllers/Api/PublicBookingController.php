<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Client;
use Illuminate\Http\Request;

/**
 * Réservation prise directement par un visiteur anonyme depuis erp_public_site — distinct de
 * BookingController::store (staff authentifié, voir routes/api.php), qui valide la réservation
 * immédiatement à la création. Ici la réservation reste "En attente" (`validated_at` null)
 * jusqu'à ce qu'un membre du staff la valide depuis erp-app (voir
 * BookingController::validateBooking, qui envoie maintenant l'email de confirmation à ce
 * moment-là plutôt qu'à la création).
 */
class PublicBookingController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'firstname' => ['required', 'string', 'max:255'],
            'lastname' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['required', 'string', 'max:50'],
            'number_of_guests' => ['required', 'integer', 'min:1', 'max:50'],
            'type' => ['required', 'string', 'in:breakfast,lunch,dinner'],
            'date' => ['required', 'date', 'after_or_equal:today'],
            'hour' => ['required', 'date_format:H:i'],
        ]);

        // Un même visiteur qui réserve plusieurs fois (ex. deux soirs différents) retrouve son
        // même Client plutôt que d'en créer un doublon à chaque passage — même principe que
        // ClientController::lookup côté kiosque, mais sur email (seul identifiant obligatoire
        // ici) plutôt que téléphone.
        $client = Client::query()->firstOrCreate(
            ['email' => $data['email']],
            ['firstname' => $data['firstname'], 'lastname' => $data['lastname'], 'phone' => $data['phone']],
        );

        $booking = Booking::query()->create([
            'client_id' => $client->id,
            'number_of_guests' => $data['number_of_guests'],
            'type' => $data['type'],
            'date' => $data['date'],
            'hour' => $data['hour'],
        ]);

        return response()->json($booking, 201);
    }
}
