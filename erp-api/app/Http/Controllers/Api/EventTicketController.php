<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\EventTicketsMail;
use App\Models\EventDate;
use App\Models\EventTicket;
use App\Models\Product;
use App\Models\TableElement;
use App\Models\Ticket;
use App\Models\TicketPayment;
use App\Models\TicketSection;
use App\Support\Qr;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class EventTicketController extends Controller
{
    private const WITH = ['client', 'table', 'ticketType', 'ticketLine'];

    /**
     * Toujours filtré par occurrence (event_date) — pas de vue "toutes les places tous events
     * confondus" pour l'instant, cohérent avec les pages qui consomment cette route (une par
     * occurrence, voir Readme.md — un event a plusieurs dates désormais).
     */
    public function index(Request $request)
    {
        $data = $request->validate(['event_date_id' => ['required', 'integer', 'exists:event_dates,id']]);

        return EventTicket::query()
            ->where('event_date_id', $data['event_date_id'])
            ->with(self::WITH)
            ->latest()
            ->get();
    }

    /**
     * Crée `quantity` places d'un coup pour le même client (un code de validation distinct
     * chacune) — répond toujours un tableau, même pour quantity=1, pour garder un seul contrat
     * côté frontend (voir Readme.md : "Possibilité de vendre plusieurs places").
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'event_date_id' => ['required', 'integer', 'exists:event_dates,id'],
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'event_ticket_type_id' => ['required', 'integer', 'exists:event_ticket_types,id'],
            'send_email' => ['boolean'],
            'quantity' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $quantity = $data['quantity'] ?? 1;
        $eventDate = EventDate::query()->with('event')->findOrFail($data['event_date_id']);

        if ($eventDate->number_place_limit !== null) {
            $sold = EventTicket::query()->where('event_date_id', $eventDate->id)->count();
            if ($sold + $quantity > $eventDate->number_place_limit) {
                $left = max($eventDate->number_place_limit - $sold, 0);
                throw ValidationException::withMessages([
                    'quantity' => ["Il ne reste que {$left} place(s) disponible(s) pour cette date."],
                ]);
            }
        }

        // Le prix n'est jamais pris tel quel côté client : on relit celui configuré pour cet
        // event (voir EventTicketPriceController) — absent = ce type n'est pas vendu ici, même si
        // il existe globalement pour d'autres events.
        $price = $eventDate->event->ticketTypes()
            ->where('event_ticket_types.id', $data['event_ticket_type_id'])
            ->value('event_ticket_prices.price');

        if ($price === null) {
            throw ValidationException::withMessages([
                'event_ticket_type_id' => ["Ce type de place n'est pas proposé pour cet événement."],
            ]);
        }

        $tickets = collect(range(1, $quantity))->map(
            fn () => EventTicket::query()->create([
                'event_date_id' => $eventDate->id,
                'client_id' => $data['client_id'],
                'event_ticket_type_id' => $data['event_ticket_type_id'],
                'price' => $price,
                'validation_code' => $this->generateCode(),
            ]),
        );

        $tickets->each->load(self::WITH);

        if ($data['send_email'] ?? false) {
            $this->sendCodesByEmail($tickets, $eventDate);
        }

        return response()->json($tickets->values(), 201);
    }

    /**
     * Encaisse une ou plusieurs places déjà vendues — modale dédiée dans EventDashboard, plus
     * simple que le panier POS Vente directe (abandonné pour ce flux) : un seul moyen de
     * paiement, pas de code promo/points fidélité/menus. Le montant n'est jamais pris tel quel
     * côté client SAUF si une ou plusieurs places n'ont pas de prix connu (vendues avant l'ajout
     * des types/tarifs) — dans ce cas `amount` est requis et sert de montant total, choisi par le
     * vendeur (voir hasUnknownPrice côté event-dashboard.ts). Sinon toujours resommé depuis
     * EventTicket::price (instantané pris à la vente), en gardant le détail par TYPE : une ligne
     * de ticket par type distinct (permet de payer d'un coup des places de types différents, ex.
     * 2 Adulte + 1 Étudiant, chacune sur sa propre ligne — regrouper par prix aurait fusionné à
     * tort deux types qui partagent le même tarif). Chaque ligne porte une note précise (type +
     * événement + date, voir ticket-receipt.html) puisque le Product lui-même reste générique
     * ("Billet événement", voir EventTicketPriceController).
     */
    public function pay(Request $request)
    {
        $data = $request->validate([
            'event_ticket_ids' => ['required', 'array', 'min:1'],
            'event_ticket_ids.*' => ['integer', 'exists:event_tickets,id'],
            'payment_method_id' => ['required', 'integer', 'exists:payment_methods,id'],
            'cash_session_id' => ['nullable', 'integer', 'exists:cash_sessions,id'],
            'amount' => ['nullable', 'numeric', 'min:0.01'],
        ]);

        $tickets = EventTicket::query()->with(['client', 'ticketType', 'eventDate.event'])->whereIn('id', $data['event_ticket_ids'])->get();

        if ($tickets->contains(fn (EventTicket $t) => $t->ticket_line_id !== null)) {
            throw ValidationException::withMessages(['event_ticket_ids' => ['Une ou plusieurs places sont déjà payées.']]);
        }

        $hasUnknownPrice = $tickets->contains(fn (EventTicket $t) => $t->price === null);

        if ($hasUnknownPrice && !isset($data['amount'])) {
            throw ValidationException::withMessages([
                'amount' => ["Une ou plusieurs places n'ont pas de prix connu — indique le montant à encaisser."],
            ]);
        }

        $total = $hasUnknownPrice ? round((float) $data['amount'], 2) : round((float) $tickets->sum('price'), 2);
        $client = $tickets->first()->client;
        $product = Product::query()->where('slug', 'billet-evenement')->firstOrFail();
        $eventDate = $tickets->first()->eventDate;
        $eventLabel = $eventDate->event->name . ' — ' . $eventDate->date->format('d/m/Y');

        DB::transaction(function () use ($tickets, $data, $total, $hasUnknownPrice, $client, $product, $eventLabel, $request) {
            $ticket = Ticket::query()->create([
                'paid_at' => now(),
                'client_id' => $client?->id,
                'source' => 'event',
            ]);

            $section = TicketSection::query()->create(['name' => 'Vente de places', 'ticket_id' => $ticket->id]);

            // Montant libre (place(s) sans prix connu) : une seule ligne pour tout le lot, le
            // détail par type n'a pas de sens puisque le vendeur a choisi le total lui-même.
            if ($hasUnknownPrice) {
                $line = $section->lines()->create([
                    'quantity' => $tickets->count(),
                    'unit_price' => round($total / $tickets->count(), 2),
                    'product_id' => $product->id,
                    'note' => $eventLabel,
                ]);

                EventTicket::query()->whereIn('id', $tickets->pluck('id'))->update(['ticket_line_id' => $line->id]);
            } else {
                foreach ($tickets->groupBy('event_ticket_type_id') as $group) {
                    $typeName = $group->first()->ticketType?->name ?? 'Place';

                    $line = $section->lines()->create([
                        'quantity' => $group->count(),
                        'unit_price' => $group->first()->price,
                        'product_id' => $product->id,
                        'note' => "{$typeName} — {$eventLabel}",
                    ]);

                    EventTicket::query()->whereIn('id', $group->pluck('id'))->update(['ticket_line_id' => $line->id]);
                }
            }

            TicketPayment::query()->create([
                'value' => $total,
                'payment_method_id' => $data['payment_method_id'],
                'ticket_id' => $ticket->id,
                'user_id' => $request->user()->id,
                'cash_session_id' => $data['cash_session_id'] ?? null,
            ]);

            return $ticket;
        });

        return response()->json(
            EventTicket::query()->with(self::WITH)->whereIn('id', $data['event_ticket_ids'])->get(),
        );
    }

    /**
     * Change le client rattaché et/ou le type de place — l'occurrence et le code restent fixes
     * une fois la place vendue (voir Readme.md : "Liste de place vendue avec modifier et
     * supprimer"). Changer le type recalcule le prix depuis le tarif configuré pour cet event
     * (jamais fait confiance au client, même logique qu'à la vente initiale, voir ::store) et
     * est refusé si la place est déjà payée — son prix payé ne doit plus bouger a posteriori.
     */
    public function update(Request $request, EventTicket $eventTicket)
    {
        $data = $request->validate([
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'event_ticket_type_id' => ['nullable', 'integer', 'exists:event_ticket_types,id'],
        ]);

        if (array_key_exists('event_ticket_type_id', $data) && $data['event_ticket_type_id'] !== $eventTicket->event_ticket_type_id) {
            if ($eventTicket->ticket_line_id !== null) {
                throw ValidationException::withMessages([
                    'event_ticket_type_id' => ['Cette place est déjà payée — son type ne peut plus être modifié.'],
                ]);
            }

            $price = $eventTicket->eventDate->event->ticketTypes()
                ->where('event_ticket_types.id', $data['event_ticket_type_id'])
                ->value('event_ticket_prices.price');

            if ($price === null) {
                throw ValidationException::withMessages([
                    'event_ticket_type_id' => ["Ce type de place n'est pas proposé pour cet événement."],
                ]);
            }

            $data['price'] = $price;
        }

        $eventTicket->update($data);

        return $eventTicket->load(self::WITH);
    }

    public function destroy(EventTicket $eventTicket)
    {
        $eventTicket->delete();

        return response()->noContent();
    }

    /**
     * PNG brut du QR d'une place — consommé directement en `<img src>` depuis le front pour
     * l'impression/PDF (voir Readme.md), pas besoin de repasser par du JSON/base64 côté client.
     */
    public function qr(EventTicket $eventTicket)
    {
        return response(Qr::png($eventTicket->validation_code), 200, ['Content-Type' => 'image/png']);
    }

    /**
     * Valide la présence via le code, et attribue une place (table) si l'occurrence a une salle
     * en placement strict. `table_id` est ignoré si l'occurrence n'a pas de `room_id`.
     *
     * `table_id` reste accepté ici (utilisé par le dashboard `erp-app`, qui laisse choisir la
     * place avant de valider) mais `erp_validate_event` ne l'envoie plus depuis 2026-07-29 —
     * ce kiosque valide d'abord, puis ouvre une modal de placement séparée (voir `assignTable`).
     */
    public function validateCode(Request $request)
    {
        $data = $request->validate([
            'code' => ['required', 'string'],
            'table_id' => ['nullable', 'integer', 'exists:tables,id'],
        ]);

        $ticket = EventTicket::query()->where('validation_code', strtoupper($data['code']))->first();

        if (!$ticket) {
            throw ValidationException::withMessages(['code' => ['Code de validation inconnu.']]);
        }

        if ($ticket->validated_at !== null) {
            throw ValidationException::withMessages(['code' => ['Cette place a déjà été validée.']]);
        }

        $eventDate = $ticket->eventDate;
        $tableId = null;

        if ($eventDate->room_id !== null && !empty($data['table_id'])) {
            $tableId = $this->resolveFreeTable($eventDate, (int) $data['table_id']);
        }

        $ticket->forceFill(['validated_at' => now(), 'table_id' => $tableId])->save();

        return $ticket->load(self::WITH);
    }

    /**
     * Attribue une place à un ticket déjà validé — utilisé par la modal de placement de
     * `erp_validate_event` (valider le code d'abord, choisir le siège ensuite). Refuse si le
     * ticket n'est pas encore validé (le check-in doit toujours passer en premier) ou a déjà
     * une place.
     */
    public function assignTable(Request $request, EventTicket $eventTicket)
    {
        $data = $request->validate([
            'table_id' => ['required', 'integer', 'exists:tables,id'],
        ]);

        if ($eventTicket->validated_at === null) {
            throw ValidationException::withMessages(['code' => ['Cette place doit être validée avant de choisir un siège.']]);
        }

        if ($eventTicket->table_id !== null) {
            throw ValidationException::withMessages(['table_id' => ['Une place est déjà attribuée à ce ticket.']]);
        }

        $tableId = $this->resolveFreeTable($eventTicket->eventDate, (int) $data['table_id']);

        $eventTicket->forceFill(['table_id' => $tableId])->save();

        return $eventTicket->load(self::WITH);
    }

    /**
     * Vérifie qu'une table appartient bien à la salle de l'occurrence et n'est pas déjà prise
     * par un autre ticket validé de la même occurrence — factorisé entre `validateCode` et
     * `assignTable` qui font tous les deux ce contrôle avant d'attribuer une place.
     */
    private function resolveFreeTable(EventDate $eventDate, int $tableId): int
    {
        $table = TableElement::query()->findOrFail($tableId);

        if ($table->room_id !== $eventDate->room_id) {
            throw ValidationException::withMessages(['table_id' => ["Cette place n'appartient pas à la salle de l'événement."]]);
        }

        $taken = EventTicket::query()
            ->where('event_date_id', $eventDate->id)
            ->where('table_id', $table->id)
            ->whereNotNull('validated_at')
            ->exists();

        if ($taken) {
            throw ValidationException::withMessages(['table_id' => ['Cette place est déjà prise.']]);
        }

        return $table->id;
    }

    private function generateCode(): string
    {
        do {
            $code = Str::upper(Str::random(8));
        } while (EventTicket::query()->where('validation_code', $code)->exists());

        return $code;
    }

    /**
     * @param \Illuminate\Support\Collection<int, EventTicket> $tickets
     */
    private function sendCodesByEmail($tickets, EventDate $eventDate): void
    {
        $client = $tickets->first()->client;
        if (!$client->email) {
            return;
        }

        // try/catch volontaire : les places sont déjà vendues/enregistrées en base à ce stade —
        // un SMTP en rade ne doit pas transformer une vente réussie en 500 côté client (voir
        // BookingController::store, même raison).
        try {
            Mail::to($client->email)->send(new EventTicketsMail($tickets, $eventDate));
        } catch (Throwable $e) {
            report($e);
        }
    }
}
