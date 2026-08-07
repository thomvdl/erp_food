<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

// "stock_consumed" volontairement absent : jamais posé via un payload client, uniquement par
// OrderSectionController::valider()/OrderController::pay via forceFill() — voir
// App\Support\StockManager.
#[Fillable(['name', 'order_id', 'state', 'asked_at'])]
class OrderSection extends Model
{
    protected function casts(): array
    {
        return [
            'asked_at' => 'datetime',
            'stock_consumed' => 'boolean',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(OrderLine::class);
    }
}
