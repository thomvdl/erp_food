<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Code de connexion à la boutique en ligne (voir ShopCustomerController::requestCode) — preuve
 * qu'on possède bien l'adresse email saisie, seule "authentification" du compte client optionnel
 * (l'identification par téléphone seule, sans ce code, a été jugée trop faible : n'importe qui
 * connaissant un numéro pouvait voir l'historique/solde de points associé). Pas `ShouldQueue`,
 * même raison que BookingConfirmationMail : pas de worker de queue déployé sur ce projet.
 */
class ClientLoginCodeMail extends Mailable
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
        return new Content(view: 'emails.client-login-code');
    }
}
