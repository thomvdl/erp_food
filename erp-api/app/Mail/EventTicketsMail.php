<?php

namespace App\Mail;

use App\Models\EventDate;
use App\Models\EventTicket;
use App\Support\Qr;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;

/**
 * Un email par vente (même si plusieurs places d'un coup, voir Readme.md "vendre plusieurs
 * places") — chaque place a son code en texte ET son QR (même donnée encodée, juste une
 * variante scannable pour la page de check-in). QR généré à la volée en data URI base64,
 * pas de fichier stocké sur disque — pas besoin, un ticket n'est email qu'à la création.
 * Volontairement pas `ShouldQueue` : aucun worker de queue n'est déployé pour ce projet
 * (voir docker-compose.yml), un mail queué resterait bloqué en base sans jamais partir.
 */
class EventTicketsMail extends Mailable
{
    use Queueable, SerializesModels;

    /** @var array<int, array{code: string, qr: string}> */
    public readonly array $tickets;

    public function __construct(
        Collection $eventTickets,
        public readonly EventDate $eventDate,
    ) {
        $this->tickets = $eventTickets->map(fn (EventTicket $ticket) => [
            'code' => $ticket->validation_code,
            'qr' => $this->buildQrDataUri($ticket->validation_code),
        ])->all();
    }

    public function envelope(): Envelope
    {
        $plural = count($this->tickets) > 1 ? 's' : '';

        return new Envelope(
            subject: "Vos place{$plural} pour {$this->eventDate->event->name}",
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.event-tickets');
    }

    private function buildQrDataUri(string $code): string
    {
        return 'data:image/png;base64,'.base64_encode(Qr::png($code));
    }
}
