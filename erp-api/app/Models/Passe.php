<?php

namespace App\Models;

use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['name', 'slug', 'station_id'])]
class Passe extends Model
{
    use HasSlug;

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }
}
