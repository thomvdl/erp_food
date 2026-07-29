<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use Illuminate\Http\Request;

class BookingController extends Controller
{
    /**
     * Filtre optionnel par jour ('date' query param, AAAA-MM-JJ) — utilisé par la liste
     * réservations pour "tri et filtre par jour" (voir Readme.md), le tri lui-même se fait
     * côté front comme pour les EventDate.
     */
    public function index(Request $request)
    {
        return Booking::query()
            ->with('client')
            ->when($request->query('date'), fn ($query, $date) => $query->whereDate('date', $date))
            ->orderBy('date')
            ->orderBy('hour')
            ->get();
    }

    public function show(Booking $booking)
    {
        return $booking->load('client');
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $booking = Booking::query()->create($data);

        return response()->json($booking->load('client'), 201);
    }

    public function update(Request $request, Booking $booking)
    {
        $data = $this->validated($request);

        $booking->update($data);

        return $booking->load('client');
    }

    public function destroy(Booking $booking)
    {
        $booking->delete();

        return response()->noContent();
    }

    /**
     * "Valider la réservation d'un client" (voir Readme.md) — marque simplement l'arrivée du
     * client, même idée que EventTicketController::validateCode mais sans code à saisir
     * puisqu'une réservation se retrouve directement par son id dans la liste du jour.
     */
    public function validateBooking(Booking $booking)
    {
        $booking->forceFill(['validated_at' => now()])->save();

        return $booking->load('client');
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'number_of_guests' => ['required', 'integer', 'min:1'],
            'type' => ['required', 'string', 'in:breakfast,lunch,dinner'],
            'date' => ['required', 'date'],
            'hour' => ['required', 'date_format:H:i'],
        ]);
    }
}
