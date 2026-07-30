<?php

namespace App\Mail;

use App\Models\Ticket;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * "Envoyer le ticket par email si un client est sélectionné" (voir Readme.md, POS - Restaurant
 * étape 6). Volontairement pas `ShouldQueue`, même raison que EventTicketsMail : aucun worker de
 * queue n'est déployé pour ce projet, un mail queué resterait bloqué en base sans jamais partir.
 */
class TicketMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly Ticket $ticket)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Votre ticket #{$this->ticket->id}");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.ticket');
    }
}
