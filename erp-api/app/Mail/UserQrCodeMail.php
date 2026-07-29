<?php

namespace App\Mail;

use App\Models\User;
use App\Support\Qr;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * "Possibilité d'envoyer le qrcode de l'utilisateur par email" (voir Readme.md) — même pattern
 * que EventTicketsMail (QR en data URI base64, pas de fichier stocké, pas ShouldQueue puisqu'
 * aucun worker de queue n'est déployé ici, voir docker-compose.yml).
 */
class UserQrCodeMail extends Mailable
{
    use Queueable, SerializesModels;

    public readonly string $qr;

    public function __construct(
        public readonly User $user,
    ) {
        $this->qr = 'data:image/png;base64,'.base64_encode(Qr::png((string) $user->barcode));
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Votre QR code de connexion — ERP v2',
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.user-qr-code');
    }
}
