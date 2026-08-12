<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Validation\ValidationException;

// "stock_consumed" volontairement absent : jamais posé via un payload client, uniquement par
// OrderSectionController::valider()/OrderController::pay via forceFill() — voir
// App\Support\StockManager.
#[Fillable(['name', 'order_id', 'state', 'asked_at'])]
class OrderSection extends Model
{
    protected function casts(): array
    {
        return [
            'asked_at' => 'datetime',
            'stock_consumed' => 'boolean',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(OrderLine::class);
    }

    /**
     * "On peut ajouter une section que si la précédente contient au moins un article" (voir
     * Readme.md) — évite d'accumuler des sections vides sans jamais les remplir. Extrait de
     * OrderSectionController::store pour être réutilisé par
     * OrderLineController::resolveSectionForGroup (voir Product::split_by_section), qui peut
     * avoir besoin de créer une section à la volée en plein ajout d'un menu.
     */
    public static function guardCanCreate(Order $order): void
    {
        $lastSection = $order->sections()->latest('id')->first();

        if ($lastSection && $lastSection->lines()->doesntExist()) {
            throw ValidationException::withMessages([
                'name' => ['Ajoute au moins un article à la section précédente avant d\'en créer une nouvelle.'],
            ]);
        }
    }
}
