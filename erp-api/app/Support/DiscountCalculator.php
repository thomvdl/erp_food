<?php

namespace App\Support;

use App\Models\Discount;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * Résout et applique un code de réduction — utilisé par TicketController::store,
 * OrderController::pay et KioskOrderController::store (les 3 endroits où un paiement est
 * réellement encaissé) ainsi que par DiscountController::validate (aperçu live côté front avant
 * paiement). Le total réduit n'est JAMAIS accepté tel quel depuis le client : chaque appelant
 * recalcule le total brut depuis les prix produits en base, puis soustrait le montant retourné
 * ici, exactement comme le prix des lignes n'est jamais fait confiance non plus.
 */
class DiscountCalculator
{
    /**
     * @throws ValidationException si le code n'existe pas, est désactivé, ou hors de sa période
     * de validité — un seul message générique ("code invalide") plutôt que de préciser la raison,
     * pour ne pas laisser deviner l'existence d'un code désactivé/expiré par tâtonnement.
     */
    public static function resolve(string $code): Discount
    {
        $discount = Discount::query()->where('code', $code)->where('active', true)->first();
        $today = Carbon::today();

        if (!$discount || $today->lt($discount->starts_at) || $today->gt($discount->ends_at)) {
            throw ValidationException::withMessages([
                'discount_code' => ['Code de réduction invalide ou expiré.'],
            ]);
        }

        return $discount;
    }

    /**
     * Montant à déduire du total (jamais négatif, jamais supérieur au total pour fixed_amount).
     * `minimum_total`, si renseigné, est un SEUIL D'ÉLIGIBILITÉ (montant d'achat minimum requis
     * pour pouvoir utiliser le code) — pas un plancher qui réduirait la réduction : une fois le
     * seuil atteint, le montant complet de la réduction s'applique toujours, même si ça amène le
     * total en dessous de ce seuil (ex. "10€ offerts dès 15€ d'achat" donne bien 10€, pas un
     * montant réduit pour rester au-dessus de 15€ après coup).
     *
     * @throws ValidationException si le total du panier est sous le seuil `minimum_total` du code.
     *
     * @param array<int, array{product_id: int, quantity: int, unit_price: float}> $lines Lignes de la commande (prix déjà recalculés côté serveur, jamais ceux envoyés par le client).
     */
    public static function amountOff(Discount $discount, array $lines, float $total): float
    {
        if ($discount->minimum_total !== null && $total < (float) $discount->minimum_total) {
            $threshold = number_format((float) $discount->minimum_total, 2, ',', ' ');
            throw ValidationException::withMessages([
                'discount_code' => ["Ce code nécessite un minimum de {$threshold} € d'achat."],
            ]);
        }

        return match ($discount->type) {
            'percentage' => round($total * ((float) $discount->value / 100), 2),
            'fixed_amount' => min((float) $discount->value, $total),
            'free_product' => static::freeProductAmount($discount, $lines),
            default => 0.0,
        };
    }

    /**
     * Le produit désigné par le code doit être présent dans la commande — sinon la réduction
     * n'a pas de sens ("code réservé aux clients qui ont pris le produit concerné"). Une seule
     * unité offerte, jamais toutes les occurrences si plusieurs ont été commandées.
     *
     * `quantity` peut être négative (voir OrderController::pay — une ligne de correction, voir
     * OrderController::correction, y est passée avec une quantity inversée) : une ligne annulée
     * par une correction ne doit jamais compter comme "le produit est dans la commande".
     *
     * @param array<int, array{product_id: int, quantity: int, unit_price: float}> $lines
     */
    private static function freeProductAmount(Discount $discount, array $lines): float
    {
        foreach ($lines as $line) {
            if ($line['product_id'] === $discount->free_product_id && $line['quantity'] > 0) {
                return $line['unit_price'];
            }
        }

        throw ValidationException::withMessages([
            'discount_code' => ['Le produit offert par ce code doit être dans la commande.'],
        ]);
    }
}
