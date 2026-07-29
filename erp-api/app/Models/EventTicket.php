<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['event_date_id', 'client_id', 'table_id', 'validation_code', 'validated_at'])]
class EventTicket extends Model
{
    protected function casts(): array
    {
        return [
            'validated_at' => 'datetime',
        ];
    }

    public function eventDate(): BelongsTo
    {
        return $this->belongsTo(EventDate::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(TableElement::class, 'table_id');
    }
}
