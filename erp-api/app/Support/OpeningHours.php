<?php

namespace App\Support;

use App\Models\Param;
use Illuminate\Support\Carbon;

/**
 * Horaires d'ouverture optionnels du self-order (voir SelfOrderController, seul consommateur),
 * dérivés des réglages génériques `self_order_open_at`/`self_order_close_at` (voir Param,
 * Paramètres > Réglages) — tant que l'un des deux n'est pas configuré, aucune restriction n'est
 * appliquée (comportement actuel inchangé). Gère le cas où la fermeture est après minuit (ex.
 * self_order_open_at=18:00, self_order_close_at=02:00).
 */
class OpeningHours
{
    public static function isOpen(): bool
    {
        [$open, $close] = self::window();

        if ($open === null || $close === null) {
            return true;
        }

        $now = Carbon::now();

        return $close->greaterThan($open)
            ? $now->between($open, $close)
            : ($now->greaterThanOrEqualTo($open) || $now->lessThan($close));
    }

    public static function closedMessage(): string
    {
        [$open, $close] = self::window();

        if ($open !== null && $close !== null) {
            return "Nous sommes actuellement fermés. Horaires d'ouverture : {$open->format('H:i')} - {$close->format('H:i')}.";
        }

        return 'Nous sommes actuellement fermés.';
    }

    /**
     * @return array{0: ?Carbon, 1: ?Carbon}
     */
    private static function window(): array
    {
        $openValue = Param::query()->where('name', 'self_order_open_at')->value('value');
        $closeValue = Param::query()->where('name', 'self_order_close_at')->value('value');

        if (!$openValue || !$closeValue) {
            return [null, null];
        }

        try {
            return [Carbon::parse($openValue), Carbon::parse($closeValue)];
        } catch (\Throwable) {
            return [null, null];
        }
    }
}
