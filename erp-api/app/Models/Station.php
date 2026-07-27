<?php

namespace App\Models;

use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'slug'])]
class Station extends Model
{
    use HasSlug;

    public function passes(): HasMany
    {
        return $this->hasMany(Passe::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }
}
