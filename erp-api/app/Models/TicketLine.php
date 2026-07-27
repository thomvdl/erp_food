<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['quantity', 'product_id', 'ticket_section_id'])]
class TicketLine extends Model
{
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function ticketSection(): BelongsTo
    {
        return $this->belongsTo(TicketSection::class);
    }
}
