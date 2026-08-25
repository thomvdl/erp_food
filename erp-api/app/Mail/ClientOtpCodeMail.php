<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Code à 6 chiffres pour la connexion par email (voir ShopCustomerController::requestOtp),
 * troisième méthode de connexion de la boutique en ligne à côté de Google et du mot de passe.
 * Volontairement pas `ShouldQueue` : aucun worker de queue n'est déployé pour ce projet (voir
 * docker-compose.yml), un mail queué resterait bloqué en base sans jamais partir.
 */
class ClientOtpCodeMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly string $code)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Votre code de connexion');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.client-otp-code');
    }
}
