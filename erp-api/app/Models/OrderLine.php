<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['quantity', 'product_id', 'order_section_id'])]
class OrderLine extends Model
{
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function orderSection(): BelongsTo
    {
        return $this->belongsTo(OrderSection::class);
    }
}
