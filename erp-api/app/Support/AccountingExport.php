<?php

namespace App\Support;

use App\Models\Ticket;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Calculs partagés par l'export comptable (CSV détaillé + PDF de synthèse, voir
 * AccountingExportController) — même répartition HT/TVA que le reçu imprimable
 * (ticket-print.util.ts::ticketTaxBreakdown côté erp-app), jamais dupliquée côté API avant ce
 * fichier : le prix produit est TTC, la TVA s'en extrait, elle ne s'ajoute pas dessus.
 */
class AccountingExport
{
    private const WITH = ['client', 'sections.lines.product.tax', 'payments.paymentMethod'];

    /** @return Collection<int, Ticket> */
    public static function ticketsBetween(Carbon $from, Carbon $to): Collection
    {
        return Ticket::query()
            ->with(self::WITH)
            ->whereBetween('paid_at', [$from, $to])
            ->orderBy('paid_at')
            ->get();
    }

    /**
     * Répartition HT/TVA par taux, calculée sur le total BRUT des lignes (avant réduction —
     * jamais répartie ligne par ligne dans ce projet, voir ReportController::bestSellers). Taux
     * 0% si le produit n'a pas de taxe assignée (même convention que le front :
     * `Number(line.product?.tax?.value ?? 0)`).
     *
     * Clé = (string) $rate plutôt que le float lui-même : un float utilisé tel quel comme clé de
     * tableau PHP est tronqué à l'entier (6.5 → 6), ce qui écraserait un taux non entier avec un
     * autre. La représentation string d'un float reste stable pour une même valeur, donc fiable
     * comme clé de regroupement ici.
     *
     * @return array<string, array{rate: float, ht: float, tva: float, ttc: float}>
     */
    public static function taxBreakdown(Ticket $ticket): array
    {
        $ttcByRate = [];

        foreach ($ticket->sections as $section) {
            foreach ($section->lines as $line) {
                $rate = (float) ($line->product?->tax?->value ?? 0);
                $sign = $line->is_correction ? -1 : 1;
                $ttc = $sign * (float) $line->unit_price * $line->quantity;

                $key = (string) $rate;
                $ttcByRate[$key] ??= ['rate' => $rate, 'ttc' => 0.0];
                $ttcByRate[$key]['ttc'] += $ttc;
            }
        }

        uasort($ttcByRate, fn (array $a, array $b) => $a['rate'] <=> $b['rate']);

        $breakdown = [];
        foreach ($ttcByRate as $key => $entry) {
            $ht = $entry['rate'] > 0 ? $entry['ttc'] / (1 + $entry['rate'] / 100) : $entry['ttc'];
            $breakdown[$key] = ['rate' => $entry['rate'], 'ht' => $ht, 'tva' => $entry['ttc'] - $ht, 'ttc' => $entry['ttc']];
        }

        return $breakdown;
    }

    /** Total brut des lignes (avant réduction) — somme des `ttc` de taxBreakdown(). */
    public static function grossTotal(Ticket $ticket): float
    {
        return array_sum(array_column(self::taxBreakdown($ticket), 'ttc'));
    }

    /** Net réellement encaissé — somme des paiements, seule source de vérité pour le montant
     *  effectivement perçu (voir ReportController::periodStats, même convention : la différence
     *  avec grossTotal() couvre aussi bien une réduction code promo que des points fidélité
     *  redimés, sans avoir à recombiner ticket.discount_amount et points_redeemed_amount ici). */
    public static function netTotal(Ticket $ticket): float
    {
        return (float) $ticket->payments->sum('value');
    }

    /** @return array<string, float> nom du moyen de paiement => montant */
    public static function paymentsByMethod(Ticket $ticket): array
    {
        $byMethod = [];
        foreach ($ticket->payments as $payment) {
            $name = $payment->paymentMethod->name;
            $byMethod[$name] = ($byMethod[$name] ?? 0) + (float) $payment->value;
        }

        return $byMethod;
    }
}
