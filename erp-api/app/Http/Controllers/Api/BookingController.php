<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\BookingConfirmationMail;
use App\Models\Booking;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Throwable;

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
        // Seul canal de création de réservation aujourd'hui (voir Readme.md) : un staff qui la
        // saisit ici l'a par définition déjà confirmée, contrairement à un hypothétique canal
        // client (self-service) qui, lui, resterait "En attente" jusqu'à validation par le staff.
        $data['validated_at'] = now();

        $booking = Booking::query()->create($data);
        $booking->load('client');

        // Confirmer la bonne prise de rendez-vous au client (voir Readme.md) — même garde-fou
        // que TicketMail/EventTicketsMail : le client n'a pas forcément d'email renseigné.
        // try/catch volontaire : un SMTP en rade ne doit pas transformer une réservation déjà
        // enregistrée en base en 500 côté client (qui réessaierait et créerait un doublon) — voir
        // BookingTest::test_create_booking_succeeds_even_when_email_sending_fails.
        if ($booking->client->email) {
            try {
                Mail::to($booking->client->email)->send(new BookingConfirmationMail($booking));
            } catch (Throwable $e) {
                report($e);
            }
        }

        return response()->json($booking, 201);
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
     * "Valider la réservation d'un client" (voir Readme.md) — confirme la réservation (ex. appel
     * de rappel, prise en compte), distinct de l'arrivée physique (voir markPresent ci-dessous) :
     * "En attente" -> "Validée" -> "Présente". C'est maintenant le seul endroit qui envoie
     * BookingConfirmationMail pour une réservation prise depuis erp_public_site
     * (PublicBookingController::store la laisse "En attente", contrairement à ::store ci-dessus
     * qui valide + envoie immédiatement pour une réservation saisie par le staff) — garde
     * `wasPending` pour ne pas renvoyer l'email si validateBooking est rappelé sur une
     * réservation déjà validée.
     */
    public function validateBooking(Booking $booking)
    {
        $wasPending = $booking->validated_at === null;

        $booking->forceFill(['validated_at' => now()])->save();
        $booking->load('client');

        if ($wasPending && $booking->client->email) {
            try {
                Mail::to($booking->client->email)->send(new BookingConfirmationMail($booking));
            } catch (Throwable $e) {
                report($e);
            }
        }

        return $booking;
    }

    /**
     * Marque l'arrivée physique du client — "Validée" -> "Présente". Force aussi `validated_at`
     * s'il était encore absent (marquer présent directement une réservation non validée reste
     * autorisé plutôt que bloqué, pour ne pas gêner le staff sur un oubli d'étape) : le flux normal
     * passe par validateBooking d'abord, mais rien n'empêche techniquement de sauter l'étape.
     */
    public function markPresent(Booking $booking)
    {
        $booking->forceFill([
            'validated_at' => $booking->validated_at ?? now(),
            'arrived_at' => now(),
        ])->save();

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
