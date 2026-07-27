<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'ticket_id'])]
class TicketSection extends Model
{
    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(TicketLine::class);
    }
}
