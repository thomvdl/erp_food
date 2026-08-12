<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['quantity', 'note', 'product_id', 'combo_id', 'menu_id', 'priced', 'order_section_id'])]
class OrderLine extends Model
{
    /**
     * "done"/"sent" (voir kitchen display) et "is_correction" (voir OrderController::correction)
     * volontairement hors #[Fillable] — ne se mettent à jour que par forceFill depuis un
     * contrôleur de confiance, jamais par mass-assignment générique depuis OrderLineController
     * (POS - Restaurant, sélection de produits normale, n'a rien à voir avec ces deux mécanismes).
     */
    protected function casts(): array
    {
        return [
            'done' => 'boolean',
            'sent' => 'boolean',
            'is_correction' => 'boolean',
            'priced' => 'boolean',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** Combo d'origine si cette ligne vient de l'éclatement d'un combo (voir
     *  OrderLineController::addCombo) — null pour une ligne ajoutée normalement. */
    public function combo(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'combo_id');
    }

    /** Menu d'origine si cette ligne vient de l'éclatement d'un menu (voir MenuResolver) — null
     *  pour une ligne ajoutée normalement ou issue d'un combo. */
    public function menu(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'menu_id');
    }

    public function orderSection(): BelongsTo
    {
        return $this->belongsTo(OrderSection::class);
    }
}
