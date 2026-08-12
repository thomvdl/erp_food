<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EventTicketType;
use Illuminate\Http\Request;

/**
 * Liste globale et réutilisable entre tous les events (ex. Adulte/Étudiant/Senior) — voir
 * EventTicketPriceController pour le prix, propre à chaque event.
 */
class EventTicketTypeController extends Controller
{
    public function index()
    {
        return EventTicketType::query()->orderBy('position')->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        // Sans position fournie, le type part en dernière position — même logique que
        // ProductCategoryController::store.
        $data['position'] ??= (int) EventTicketType::query()->max('position') + 1;

        return response()->json(EventTicketType::query()->create($data), 201);
    }

    public function show(EventTicketType $eventTicketType)
    {
        return $eventTicketType;
    }

    public function update(Request $request, EventTicketType $eventTicketType)
    {
        $data = $this->validated($request);
        $eventTicketType->update($data);

        return $eventTicketType;
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'position' => ['nullable', 'integer', 'min:0'],
            'active' => ['boolean'],
        ]);
    }
}
