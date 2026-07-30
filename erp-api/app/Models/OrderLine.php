<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['quantity', 'product_id', 'order_section_id'])]
class OrderLine extends Model
{
    /**
     * "done"/"sent" (voir kitchen display) volontairement hors #[Fillable] — ne se mettent à
     * jour que via OrderSectionController::marquerFait/envoyer (forceFill), jamais par
     * mass-assignment générique depuis OrderLineController (POS - Restaurant, sélection de
     * produits, n'a rien à voir avec le suivi cuisine).
     */
    protected function casts(): array
    {
        return [
            'done' => 'boolean',
            'sent' => 'boolean',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function orderSection(): BelongsTo
    {
        return $this->belongsTo(OrderSection::class);
    }
}
