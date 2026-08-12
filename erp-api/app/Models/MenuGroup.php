<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

#[Fillable(['product_id', 'label', 'min_choices', 'max_choices', 'position'])]
class MenuGroup extends Model
{
    protected function casts(): array
    {
        return [
            'min_choices' => 'integer',
            'max_choices' => 'integer',
            'position' => 'integer',
        ];
    }

    /** Le produit "menu" propriétaire de ce groupe (is_menu=true). */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** Produits éligibles dans ce groupe (voir menu_group_options). */
    public function options(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'menu_group_options');
    }
}
