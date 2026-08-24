<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['state', 'client_id', 'table_id', 'table_number', 'number_of_guests', 'ticket_id', 'source', 'fulfillment_type', 'delivery_address', 'customer_name', 'customer_phone', 'delivery_status'])]
class Order extends Model
{
    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(TableElement::class, 'table_id');
    }

    public function sections(): HasMany
    {
        return $this->hasMany(OrderSection::class);
    }
}
