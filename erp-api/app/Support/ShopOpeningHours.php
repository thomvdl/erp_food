<?php

namespace App\Support;

use App\Models\Param;
use Illuminate\Support\Carbon;

/**
 * Horaires ET jours d'ouverture de la boutique en ligne (erp_public_shop), dérivés des réglages
 * `shop_open_at`/`shop_close_at`/`shop_open_days` (Param, Paramètres > Réglages) — même principe
 * que App\Support\OpeningHours (self_order), volontairement gardée séparée plutôt que
 * généralisée : contrairement au self-order (fermé = catalogue entièrement masqué, voir
 * SelfOrderController::show), la boutique doit rester consultable en dehors des horaires
 * ("afficher le site quand même mais bloquer les commandes", demande explicite) — seul
 * ShopCheckoutController::store consulte isOpen(), jamais ShopCatalogController::index (qui
 * expose juste isOpen()/closedMessage() en plus, pour afficher un bandeau sans rien bloquer).
 * Chaque réglage manquant/vide désactive sa propre restriction (comportement actuel inchangé tant
 * que rien n'est configuré) : on peut restreindre seulement les jours, seulement les heures, les
 * deux, ou aucun des deux.
 *
 * isOpenAt()/closedMessageAt() (2026-09-22) : généralisées pour accepter n'importe quelle date,
 * pas seulement "maintenant" — nécessaire pour valider un créneau différé choisi par le client
 * (voir ShopCheckoutController::store, "commande différée") avec exactement les mêmes règles que
 * "la boutique est-elle ouverte là, tout de suite", plutôt que dupliquer la logique jour/heure.
 */
class ShopOpeningHours
{
    /** Ordre + valeurs stockées dans `shop_open_days` (CSV, ex. "mon,tue,wed,thu,fri,sat") — pas
     *  les numéros ISO (1-7) pour rester lisible/modifiable à la main depuis Réglages. */
    private const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    private const DAY_LABELS = [
        'mon' => 'lundi', 'tue' => 'mardi', 'wed' => 'mercredi', 'thu' => 'jeudi',
        'fri' => 'vendredi', 'sat' => 'samedi', 'sun' => 'dimanche',
    ];

    public static function isOpen(): bool
    {
        return self::isOpenAt(Carbon::now());
    }

    public static function isOpenAt(Carbon $at): bool
    {
        return self::isOpenDayAt($at) && self::isOpenTimeAt($at);
    }

    public static function closedMessage(): string
    {
        return self::closedMessageAt(Carbon::now());
    }

    public static function closedMessageAt(Carbon $at): string
    {
        if (!self::isOpenDayAt($at)) {
            $days = self::openDaysLabel();

            return $days ? "Fermé ce jour-là. Jours d'ouverture : {$days}." : 'Fermé ce jour-là.';
        }

        if (!self::isOpenTimeAt($at)) {
            [$open, $close] = self::window();

            if ($open !== null && $close !== null) {
                return "En dehors des horaires d'ouverture : {$open->format('H:i')} - {$close->format('H:i')}.";
            }
        }

        return 'Nous sommes actuellement fermés.';
    }

    /** CSV `shop_open_days` déjà configuré (Réglages) — null = pas de restriction de jour. Exposé
     *  pour que le front (choix d'un créneau différé) construise ses propres options sans
     *  dupliquer les libellés/l'ordre des jours — toujours revalidé ici côté serveur ensuite. */
    public static function openDaysList(): ?array
    {
        return self::openDays();
    }

    /** @return array{0: ?string, 1: ?string} format "HH:mm", null si non configuré. */
    public static function hoursWindow(): array
    {
        [$open, $close] = self::window();

        return [$open?->format('H:i'), $close?->format('H:i')];
    }

    private static function isOpenDayAt(Carbon $at): bool
    {
        $openDays = self::openDays();

        if ($openDays === null) {
            return true;
        }

        return in_array(self::DAY_KEYS[$at->dayOfWeekIso - 1], $openDays, true);
    }

    private static function isOpenTimeAt(Carbon $at): bool
    {
        [$openTime, $closeTime] = self::window();

        if ($openTime === null || $closeTime === null) {
            return true;
        }

        // window() renvoie des Carbon calés sur AUJOURD'HUI (Carbon::parse('10:00')) — projetés
        // ici sur la date de $at pour comparer uniquement l'heure, $at pouvant être un jour futur.
        $open = $at->copy()->setTimeFrom($openTime);
        $close = $at->copy()->setTimeFrom($closeTime);

        return $close->greaterThan($open)
            ? $at->between($open, $close)
            : ($at->greaterThanOrEqualTo($open) || $at->lessThan($close));
    }

    /** @return ?array<int, string> null = pas de restriction (réglage absent/vide) */
    private static function openDays(): ?array
    {
        $value = Param::query()->where('name', 'shop_open_days')->value('value');

        if (!$value) {
            return null;
        }

        $days = array_values(array_intersect(self::DAY_KEYS, array_map('trim', explode(',', strtolower($value)))));

        // Une valeur mal saisie qui ne matche aucun jour connu équivaut à "pas de restriction"
        // plutôt qu'à "fermé tous les jours" — moins surprenant pour l'admin qui vient de taper
        // une faute de frappe (voir même filet de sécurité que window() ci-dessous).
        return $days === [] ? null : $days;
    }

    private static function openDaysLabel(): ?string
    {
        $days = self::openDays();

        if ($days === null) {
            return null;
        }

        return implode(', ', array_map(fn (string $day) => self::DAY_LABELS[$day], $days));
    }

    /**
     * @return array{0: ?Carbon, 1: ?Carbon}
     */
    private static function window(): array
    {
        $openValue = Param::query()->where('name', 'shop_open_at')->value('value');
        $closeValue = Param::query()->where('name', 'shop_close_at')->value('value');

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
