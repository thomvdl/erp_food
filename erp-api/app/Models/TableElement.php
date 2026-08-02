<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

// Table SQL "tables" (nom du Readme.md) — classe renommée TableElement pour éviter la
// confusion avec le concept générique de "table" en base/PHP (cf. $table de Blueprint).
// "qr_token" volontairement hors du Fillable — jamais fourni par le client, uniquement généré
// automatiquement à la création (voir booted() ci-dessous), même logique que active_restaurant/
// active_direct_sale sur ProductCatalog.
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

    protected static function booted(): void
    {
        static::creating(function (TableElement $table) {
            $table->qr_token ??= Str::random(24);
        });
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
