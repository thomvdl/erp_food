<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'stripe_checkout_session_id', 'status', 'fulfillment_type', 'lines', 'total', 'delivery_fee',
    'customer_name', 'customer_email', 'customer_phone', 'delivery_address', 'ticket_id',
    'discount_id', 'discount_amount', 'client_id', 'points_earned', 'points_redeemed', 'points_redeemed_amount',
])]
class ShopCheckout extends Model
{
    protected function casts(): array
    {
        return [
            'lines' => 'array',
            'total' => 'decimal:2',
            'delivery_fee' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'points_earned' => 'integer',
            'points_redeemed' => 'integer',
            'points_redeemed_amount' => 'decimal:2',
        ];
    }

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }

    public function discount(): BelongsTo
    {
        return $this->belongsTo(Discount::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }
}
