<?php

namespace App\Mail;

use App\Models\Booking;
use App\Support\BookingIcs;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Envoyée à la création d'une réservation (voir BookingController::store) pour confirmer au
 * client la bonne prise de rendez-vous. Volontairement pas `ShouldQueue`, même raison que
 * TicketMail/EventTicketsMail : aucun worker de queue n'est déployé pour ce projet, un mail
 * queué resterait bloqué en base sans jamais partir.
 */
class BookingConfirmationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly Booking $booking)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Confirmation de votre réservation');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.booking-confirmation');
    }

    /**
     * La plupart des clients mail (Apple Mail, Outlook desktop...) détectent une pièce jointe
     * .ics toute seule et proposent "Ajouter au calendrier" sans action supplémentaire — pas
     * besoin d'un bouton dans le corps de l'email.
     */
    public function attachments(): array
    {
        return [
            Attachment::fromData(fn () => BookingIcs::build($this->booking), 'reservation.ics')->withMime('text/calendar'),
        ];
    }
}
