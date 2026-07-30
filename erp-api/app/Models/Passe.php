<?php

namespace App\Models;

use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'slug', 'active'])]
class Passe extends Model
{
    use HasSlug;

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
        ];
    }

    /** Plusieurs stations peuvent partager un même passe (voir CONTEXT.md — relation inversée). */
    public function stations(): HasMany
    {
        return $this->hasMany(Station::class);
    }
}
