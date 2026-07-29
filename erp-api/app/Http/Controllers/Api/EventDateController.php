<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Models\EventDate;
use Illuminate\Http\Request;

/**
 * Occurrences datées d'un event (voir Readme.md : "créer un event puis ajouter des dates,
 * heure, places, room"). `store` est imbriqué sous l'event (POST /events/{event}/dates,
 * comme TableElementController sous Room) ; `index` accepte un `event_id` optionnel — sans
 * lui, renvoie toutes les dates tous events confondus (utilisé par erp_validate_event pour
 * choisir une occurrence à l'entrée, qui n'a pas de notion d'event "courant").
 */
class EventDateController extends Controller
{
    private const WITH = ['event', 'room'];

    public function index(Request $request)
    {
        $data = $request->validate(['event_id' => ['nullable', 'integer', 'exists:events,id']]);

        return EventDate::query()
            ->when(!empty($data['event_id']), fn ($query) => $query->where('event_id', $data['event_id']))
            ->with(self::WITH)
            ->orderBy('date')
            ->orderBy('start_hour')
            ->get();
    }

    public function store(Request $request, Event $event)
    {
        $data = $this->validated($request);

        $eventDate = $event->dates()->create($data);

        return response()->json($eventDate->load(self::WITH), 201);
    }

    public function show(EventDate $eventDate)
    {
        return $eventDate->load([...self::WITH, 'room.tables']);
    }

    public function update(Request $request, EventDate $eventDate)
    {
        $data = $this->validated($request);
        $eventDate->update($data);

        return $eventDate->load(self::WITH);
    }

    public function destroy(EventDate $eventDate)
    {
        $eventDate->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'date' => ['required', 'date'],
            'start_hour' => ['required', 'date_format:H:i'],
            'room_id' => ['nullable', 'integer', 'exists:rooms,id'],
            'number_place_limit' => ['nullable', 'integer', 'min:1'],
        ]);
    }
}
