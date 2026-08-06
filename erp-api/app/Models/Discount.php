<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['code', 'type', 'value', 'minimum_total', 'free_product_id', 'starts_at', 'ends_at', 'active'])]
class Discount extends Model
{
    protected function casts(): array
    {
        return [
            'value' => 'decimal:2',
            'minimum_total' => 'decimal:2',
            'starts_at' => 'date',
            'ends_at' => 'date',
            'active' => 'boolean',
        ];
    }

    public function freeProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'free_product_id');
    }
}
