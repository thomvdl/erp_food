<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['quantity', 'note', 'is_correction', 'unit_price', 'product_id', 'menu_id', 'ticket_section_id'])]
class TicketLine extends Model
{
    protected function casts(): array
    {
        return [
            'unit_price' => 'decimal:2',
            'is_correction' => 'boolean',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** Menu d'origine si cette ligne vient de l'éclatement d'un menu (voir MenuResolver) —
     *  unit_price=0 pour ces lignes, le prix réel est porté par la ligne "porteuse" séparée
     *  (product_id = le menu lui-même). Null pour une ligne normale. */
    public function menu(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'menu_id');
    }

    public function ticketSection(): BelongsTo
    {
        return $this->belongsTo(TicketSection::class);
    }
}
