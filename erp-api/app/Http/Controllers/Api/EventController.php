<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use Illuminate\Http\Request;

class EventController extends Controller
{
    /** Nombre de dates chargé pour l'affichage liste (voir Readme.md — un event a plusieurs
     *  occurrences maintenant), sans charger toutes les dates elles-mêmes ici. */
    private const WITH_COUNT = ['dates'];

    public function index()
    {
        return Event::query()->withCount('dates')->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        return response()->json(Event::query()->create($data)->loadCount(self::WITH_COUNT), 201);
    }

    public function show(Event $event)
    {
        // Les dates elles-mêmes (avec salle) sont chargées séparément par
        // EventDateController::index — ici juste l'event et son nombre de dates.
        return $event->loadCount(self::WITH_COUNT);
    }

    public function update(Request $request, Event $event)
    {
        $data = $this->validated($request);
        $event->update($data);

        return $event->loadCount(self::WITH_COUNT);
    }

    public function destroy(Event $event)
    {
        $event->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);
    }
}
