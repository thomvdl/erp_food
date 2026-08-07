<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'stripe_checkout_session_id', 'status', 'cash_session_id', 'client_id',
    'discount_id', 'discount_amount', 'lines', 'total', 'ticket_id',
])]
class KioskCheckout extends Model
{
    protected function casts(): array
    {
        return [
            'lines' => 'array',
            'discount_amount' => 'decimal:2',
            'total' => 'decimal:2',
        ];
    }

    public function cashSession(): BelongsTo
    {
        return $this->belongsTo(CashSession::class);
    }

    public function discount(): BelongsTo
    {
        return $this->belongsTo(Discount::class);
    }

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }
}
