<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

// Table SQL "tables" (nom du Readme.md) — classe renommée TableElement pour éviter la
// confusion avec le concept générique de "table" en base/PHP (cf. $table de Blueprint).
#[Fillable(['type', 'label', 'pos_left', 'pos_top', 'width', 'height', 'room_id', 'active'])]
class TableElement extends Model
{
    protected $table = 'tables';

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
        ];
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class, 'table_id');
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class, 'table_id');
    }
}
