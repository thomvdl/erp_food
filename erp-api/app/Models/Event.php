<?php

namespace App\Models;

use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'slug'])]
class Event extends Model
{
    use HasSlug;

    public function dates(): HasMany
    {
        return $this->hasMany(EventDate::class);
    }

    /** Tarifs propres à cet event (voir event_ticket_prices) — un type absent ici n'est pas
     *  proposé à la vente pour cet event, voir EventTicketPriceController. */
    public function ticketTypes(): BelongsToMany
    {
        return $this->belongsToMany(EventTicketType::class, 'event_ticket_prices')->withPivot('price')->withTimestamps();
    }
}
