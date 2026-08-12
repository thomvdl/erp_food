<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * Une imprimante thermique réseau par poste physique — voir App\Support\ThermalReceipt::print()
 * et la migration create_printers_table pour le contexte (remplace l'IP unique globale).
 */
#[Fillable(['name', 'ip_address', 'port', 'chars_per_line', 'active'])]
class Printer extends Model
{
    protected function casts(): array
    {
        return [
            'port' => 'integer',
            'chars_per_line' => 'integer',
            'active' => 'boolean',
        ];
    }
}
