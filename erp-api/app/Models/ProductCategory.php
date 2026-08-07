<?php

namespace App\Models;

use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

#[Fillable(['name', 'slug', 'active', 'icon', 'image_path'])]
class ProductCategory extends Model
{
    use HasSlug;

    protected $appends = ['image_url'];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
        ];
    }

    /** Voir Product::imageUrl() — même principe. */
    protected function imageUrl(): Attribute
    {
        return Attribute::make(get: fn () => $this->image_path ? Storage::disk('public')->url($this->image_path) : null);
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }
}
