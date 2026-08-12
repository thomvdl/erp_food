<?php

namespace App\Models;

use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'slug', 'prefix', 'type', 'width', 'height', 'active'])]
class Room extends Model
{
    use HasSlug;

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
        ];
    }

    public function tables(): HasMany
    {
        return $this->hasMany(TableElement::class);
    }
}
