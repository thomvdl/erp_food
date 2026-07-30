<?php

namespace App\Models;

use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'slug', 'passe_id', 'active'])]
class Station extends Model
{
    use HasSlug;

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
        ];
    }

    /** "C'est dans station qu'on doit pouvoir choisir dans quelle passe ça doit aller" (voir Readme.md). */
    public function passe(): BelongsTo
    {
        return $this->belongsTo(Passe::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }
}
