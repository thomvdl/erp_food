<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['firstname', 'lastname', 'email', 'phone'])]
class Client extends Model
{
    protected function casts(): array
    {
        return [
            'points_balance' => 'integer',
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
}
