<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * Table de paramètres génériques clé/valeur (ex. self_order_open_at/self_order_close_at pour les
 * horaires d'ouverture du self-order) — pas de schéma dédié par réglage, juste un name/value
 * libre géré depuis Paramètres > Réglages.
 */
#[Fillable(['name', 'value'])]
class Param extends Model
{
    //
}
