<?php

namespace App\Models;

use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'slug'])]
class Event extends Model
{
    use HasSlug;

    public function dates(): HasMany
    {
        return $this->hasMany(EventDate::class);
    }
}
