<?php

namespace App\Models;

use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'slug', 'type'])]
class Room extends Model
{
    use HasSlug;

    public function tables(): HasMany
    {
        return $this->hasMany(TableElement::class);
    }
}
