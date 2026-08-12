<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Models\EventTicketType;
use Illuminate\Http\Request;

/**
 * Prix des types de place PAR event (confirmé explicitement, pas un tarif global unique) —
 * l'absence de ligne pour un (event, type) donné signifie que ce type n'est pas vendu pour cet
 * event. Toutes les dates du même event partagent ces prix (voir EventTicket::price, qui en
 * copie un instantané à la vente puis à l'encaissement, voir EventTicketController::pay).
 */
class EventTicketPriceController extends Controller
{
    /** Tous les types actifs, avec le prix de CET event s'il en a un (sinon null = non proposé) —
     *  laisse le front afficher un champ vide plutôt que d'omettre silencieusement une ligne. */
    public function index(Event $event)
    {
        $prices = $event->ticketTypes()->pluck('event_ticket_prices.price', 'event_ticket_types.id');

        return EventTicketType::query()
            ->where('active', true)
            ->orderBy('position')
            ->orderBy('name')
            ->get()
            ->map(fn (EventTicketType $type) => [
                'event_ticket_type_id' => $type->id,
                'name' => $type->name,
                'price' => $prices->get($type->id),
            ])
            ->values();
    }

    /** Remplace l'ensemble des prix de cet event — un type sans prix (null/absent du payload)
     *  est retiré de la vente pour cet event (voir BelongsToMany::sync). */
    public function update(Request $request, Event $event)
    {
        $data = $request->validate([
            'prices' => ['required', 'array'],
            'prices.*.event_ticket_type_id' => ['required', 'integer', 'exists:event_ticket_types,id'],
            'prices.*.price' => ['nullable', 'numeric', 'min:0'],
        ]);

        $synced = collect($data['prices'])
            ->filter(fn (array $row) => $row['price'] !== null)
            ->mapWithKeys(fn (array $row) => [$row['event_ticket_type_id'] => ['price' => $row['price']]]);

        $event->ticketTypes()->sync($synced);

        return $this->index($event);
    }
}
