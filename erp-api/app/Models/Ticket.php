<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['paid_at', 'client_id', 'table_id', 'source', 'discount_id', 'discount_amount'])]
class Ticket extends Model
{
    protected function casts(): array
    {
        return [
            'paid_at' => 'datetime',
            'discount_amount' => 'decimal:2',
        ];
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    /** Code de réduction appliqué à ce ticket, figé au paiement (voir DiscountCalculator) — null si aucun. */
    public function discount(): BelongsTo
    {
        return $this->belongsTo(Discount::class);
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(TableElement::class, 'table_id');
    }

    public function sections(): HasMany
    {
        return $this->hasMany(TicketSection::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(TicketPayment::class);
    }
}
