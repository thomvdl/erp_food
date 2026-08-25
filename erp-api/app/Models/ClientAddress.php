<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Adresse enregistrée par un client de la boutique en ligne (erp_public_shop) — voir
 * ShopCustomerAddressController. `address` est toujours le texte normalisé par
 * App\Support\DeliveryZone::checkAddress (Nominatim), jamais saisi tel quel.
 */
#[Fillable(['client_id', 'label', 'address', 'is_default'])]
class ClientAddress extends Model
{
    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
        ];
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }
}
