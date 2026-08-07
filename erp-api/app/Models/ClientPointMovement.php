<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Une ligne d'historique de points fidélité (voir App\Support\LoyaltyPoints) — `points` signé :
 * positif = gagné, négatif = utilisé. Toujours créé à l'intérieur de la transaction qui crée le
 * Ticket concerné (voir LoyaltyPoints::apply()), jamais directement.
 */
#[Fillable(['client_id', 'ticket_id', 'points'])]
class ClientPointMovement extends Model
{
    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }
}
