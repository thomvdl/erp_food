<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

#[Fillable(['title', 'subtitle', 'position', 'active', 'image_path'])]
class KioskBanner extends Model
{
    protected $appends = ['image_url'];

    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'active' => 'boolean',
        ];
    }

    /** Voir ProductCategory::imageUrl() — même principe. */
    protected function imageUrl(): Attribute
    {
        return Attribute::make(get: fn () => $this->image_path ? Storage::disk('public')->url($this->image_path) : null);
    }
}
