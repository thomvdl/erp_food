<?php

namespace App\Models;

use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

#[Fillable(['name', 'slug', 'image_path'])]
class Event extends Model
{
    use HasSlug;

    protected $appends = ['image_url'];

    /** Voir Product::imageUrl()/ProductCategory::imageUrl() — même principe, pas d'icône ici. */
    protected function imageUrl(): Attribute
    {
        return Attribute::make(get: fn () => $this->image_path ? Storage::disk('public')->url($this->image_path) : null);
    }

    public function dates(): HasMany
    {
        return $this->hasMany(EventDate::class);
    }

    /** Tarifs propres à cet event (voir event_ticket_prices) — un type absent ici n'est pas
     *  proposé à la vente pour cet event, voir EventTicketPriceController. */
    public function ticketTypes(): BelongsToMany
    {
        return $this->belongsToMany(EventTicketType::class, 'event_ticket_prices')->withPivot('price')->withTimestamps();
    }
}
