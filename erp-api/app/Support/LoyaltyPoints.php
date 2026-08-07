<?php

namespace App\Support;

use App\Models\Client;
use Illuminate\Validation\ValidationException;

/**
 * Programme de fidélité — résolution et application, sur le même principe que
 * DiscountCalculator (utilisé par les mêmes points d'encaissement : TicketController::store,
 * OrderController::pay, KioskOrderController::store via KioskSaleRecorder,
 * KioskCheckoutController::store + StripeWebhookController::markPaid pour le variant QR). 1 point
 * gagné par euro net réellement encaissé (après réduction éventuelle), 100 points = 5€ de
 * réduction. Contrairement aux codes promo, l'utilisation des points n'est pas réservée aux
 * superviseur+ : un point n'est pas un code partageable/devinable, il vient du solde réel d'un
 * client déjà sélectionné et plafonné au montant dû, le risque d'abus est structurellement
 * différent.
 */
class LoyaltyPoints
{
    public const EUR_PER_POINT = 0.05;

    /** Points gagnés sur un montant net (après TOUTES les réductions, promo et points confondus) — jamais de gain sur la part payée en points. */
    public static function earned(float $netTotal): int
    {
        return (int) floor(max($netTotal, 0));
    }

    /**
     * Montant à déduire du total pour `$pointsRequested` points.
     *
     * @throws ValidationException si aucun client n'est sélectionné, s'il n'a pas assez de
     * points, ou si la valeur demandée dépasse le montant encore dû (rejet explicite plutôt qu'un
     * plafonnement silencieux — même esprit que `minimum_total` sur les codes promo : au
     * caissier de réduire le nombre de points saisi).
     */
    public static function amountOff(int $pointsRequested, ?Client $client, float $remainingTotal): float
    {
        if ($pointsRequested <= 0) {
            return 0.0;
        }

        if (!$client) {
            throw ValidationException::withMessages([
                'points_redeemed' => ['Sélectionnez un client pour utiliser des points.'],
            ]);
        }

        if ($pointsRequested > $client->points_balance) {
            throw ValidationException::withMessages([
                'points_redeemed' => ['Ce client ne dispose pas de suffisamment de points.'],
            ]);
        }

        $amount = round($pointsRequested * self::EUR_PER_POINT, 2);

        if ($amount > $remainingTotal) {
            throw ValidationException::withMessages([
                'points_redeemed' => ['Ce nombre de points dépasse le montant restant dû — réduisez le nombre de points utilisés.'],
            ]);
        }

        return $amount;
    }

    /**
     * Trace le(s) mouvement(s) et met à jour le solde — à appeler DANS la transaction qui crée le
     * Ticket, jamais avant (voir les points d'appel). Jusqu'à deux lignes d'historique (un gain
     * et une dépense sont possibles sur la même vente, voir le cumul promo+points).
     */
    public static function apply(Client $client, int $pointsEarned, int $pointsRedeemed, ?int $ticketId): void
    {
        if ($pointsRedeemed > 0) {
            $client->pointMovements()->create(['ticket_id' => $ticketId, 'points' => -$pointsRedeemed]);
        }

        if ($pointsEarned > 0) {
            $client->pointMovements()->create(['ticket_id' => $ticketId, 'points' => $pointsEarned]);
        }

        if ($pointsEarned !== 0 || $pointsRedeemed !== 0) {
            $client->increment('points_balance', $pointsEarned - $pointsRedeemed);
        }
    }
}
