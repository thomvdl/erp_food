<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'user_id',
    'opening_amount',
    'opened_at',
    'closing_amount',
    'expected_amount',
    'discrepancy',
    'closed_at',
    'closed_by_user_id',
    'note',
])]
class CashSession extends Model
{
    protected function casts(): array
    {
        return [
            'opening_amount' => 'decimal:2',
            'closing_amount' => 'decimal:2',
            'expected_amount' => 'decimal:2',
            'discrepancy' => 'decimal:2',
            'opened_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by_user_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(TicketPayment::class);
    }

    public function counts(): HasMany
    {
        return $this->hasMany(CashSessionCount::class);
    }

    /** Sessions encore ouvertes — "ouverte" = closed_at null, pas de colonne status dédiée. */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNull('closed_at');
    }
}
