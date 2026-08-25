<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['firstname', 'lastname', 'email', 'phone', 'password', 'google_id'])]
// ClientController (backoffice) renvoie le modèle brut (index/show/store) — sans ça le hash du
// mot de passe fuiterait dans ces réponses, même pattern que User.
#[Hidden(['password'])]
class Client extends Model
{
    protected function casts(): array
    {
        return [
            'points_balance' => 'integer',
            'password' => 'hashed',
        ];
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function eventTickets(): HasMany
    {
        return $this->hasMany(EventTicket::class);
    }

    /** Historique des mouvements de points (voir App\Support\LoyaltyPoints) — clients.points_balance reste la valeur de référence pour l'affichage courant. */
    public function pointMovements(): HasMany
    {
        return $this->hasMany(ClientPointMovement::class);
    }

    /** Adresses enregistrées côté boutique en ligne (voir ShopCustomerAddressController). */
    public function addresses(): HasMany
    {
        return $this->hasMany(ClientAddress::class);
    }

    /** Historique des codes de connexion par email envoyés (voir ShopCustomerController::requestOtp) — seulement ceux demandés alors que ce Client existait déjà. */
    public function otpCodes(): HasMany
    {
        return $this->hasMany(ClientOtpCode::class);
    }

    /**
     * Résout un client par téléphone OU email — jamais par un id brut envoyé par le front (voir
     * docblock de ShopCustomerController). Cherche par téléphone en priorité si les deux sont
     * fournis, un compte créé via Google n'a généralement pas de téléphone.
     */
    public static function findByPhoneOrEmail(?string $phone, ?string $email): ?self
    {
        return static::query()
            ->when(
                !empty($phone),
                fn ($query) => $query->where('phone', $phone),
                fn ($query) => $query->where('email', $email),
            )
            ->first();
    }
}
