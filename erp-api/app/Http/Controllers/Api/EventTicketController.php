<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\EventTicketsMail;
use App\Models\EventDate;
use App\Models\EventTicket;
use App\Models\TableElement;
use App\Support\Qr;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class EventTicketController extends Controller
{
    private const WITH = ['client', 'table'];

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

        $tickets = collect(range(1, $quantity))->map(
            fn () => EventTicket::query()->create([
                'event_date_id' => $eventDate->id,
                'client_id' => $data['client_id'],
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
     * Ne permet de changer que le client rattaché — l'occurrence et le code restent fixes une
     * fois la place vendue (voir Readme.md : "Liste de place vendue avec modifier et supprimer").
     */
    public function update(Request $request, EventTicket $eventTicket)
    {
        $data = $request->validate([
            'client_id' => ['required', 'integer', 'exists:clients,id'],
        ]);

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

        Mail::to($client->email)->send(new EventTicketsMail($tickets, $eventDate));
    }
}
