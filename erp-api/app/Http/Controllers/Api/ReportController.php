<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Rapports (voir Readme.md — page "Rapports" côté erp-app, distincte du Dashboard qui reste un
 * coup d'œil "aujourd'hui") : comparaison à la période équivalente précédente + meilleures ventes.
 * Aucune agrégation n'existait avant ce contrôleur (pas de groupBy/sum ailleurs dans l'API).
 */
class ReportController extends Controller
{
    public function summary(Request $request)
    {
        $period = $request->validate([
            'period' => ['required', Rule::in(['jour', 'semaine', 'mois'])],
        ])['period'];

        [$currentStart, $currentEnd, $previousStart, $previousEnd] = $this->resolvePeriod($period);

        return response()->json([
            'period' => $period,
            'current' => $this->periodStats($currentStart, $currentEnd),
            'previous' => $this->periodStats($previousStart, $previousEnd),
            'best_sellers' => $this->bestSellers($currentStart, $currentEnd),
        ]);
    }

    /**
     * Comparaison à durée écoulée égale, pas à la période précédente entière : le 7 du mois, on
     * compare "du 1er au 7" à "du 1er au 7 du mois précédent", pas au mois précédent complet —
     * sinon la comparaison est toujours défavorable en début de période.
     *
     * @return array{0: Carbon, 1: Carbon, 2: Carbon, 3: Carbon}
     */
    private function resolvePeriod(string $period): array
    {
        $now = Carbon::now();

        $currentStart = match ($period) {
            'jour' => $now->copy()->startOfDay(),
            'semaine' => $now->copy()->startOfWeek(),
            'mois' => $now->copy()->startOfMonth(),
        };

        $shift = match ($period) {
            'jour' => fn (Carbon $date) => $date->subDay(),
            'semaine' => fn (Carbon $date) => $date->subWeek(),
            'mois' => fn (Carbon $date) => $date->subMonth(),
        };

        $previousStart = $shift($currentStart->copy());
        $previousEnd = $shift($now->copy());

        return [$currentStart, $now, $previousStart, $previousEnd];
    }

    /**
     * CA + nombre de ventes calculés depuis ticket_payments, pas depuis les lignes : la somme des
     * paiements est déjà le montant réellement encaissé (net de réduction/points — chaque
     * contrôleur d'encaissement vérifie sum(payments) === total avant de créer le Ticket), pas
     * besoin de recalculer une réduction ici.
     *
     * @return array{revenue: float, tickets_count: int}
     */
    private function periodStats(Carbon $start, Carbon $end): array
    {
        $row = DB::table('tickets')
            ->join('ticket_payments', 'tickets.id', '=', 'ticket_payments.ticket_id')
            ->whereBetween('tickets.paid_at', [$start, $end])
            ->selectRaw('COALESCE(SUM(ticket_payments.value), 0) as revenue, COUNT(DISTINCT tickets.id) as tickets_count')
            ->first();

        return [
            'revenue' => round((float) $row->revenue, 2),
            'tickets_count' => (int) $row->tickets_count,
        ];
    }

    /**
     * Top 10 produits par CA — ticket_lines.is_correction est toujours stocké avec une quantity
     * POSITIVE en base (voir migration add_is_correction_to_ticket_lines_table), le signe
     * s'applique en code, jamais persisté : reproduit ici en SQL la même règle que
     * ticket-print.util.ts::ticketLineTotal côté front (une ligne de correction retire, elle
     * n'ajoute jamais). CA volontairement BRUT (avant réduction ticket) : la réduction n'est
     * jamais répartie ligne par ligne dans ce projet, même convention que ticketNetTotal() qui la
     * soustrait au niveau du total.
     *
     * @return array<int, array{product_id: int, product_name: string, quantity: int, revenue: float}>
     */
    private function bestSellers(Carbon $start, Carbon $end): array
    {
        return DB::table('ticket_lines')
            ->join('ticket_sections', 'ticket_lines.ticket_section_id', '=', 'ticket_sections.id')
            ->join('tickets', 'ticket_sections.ticket_id', '=', 'tickets.id')
            ->join('products', 'ticket_lines.product_id', '=', 'products.id')
            ->whereBetween('tickets.paid_at', [$start, $end])
            ->selectRaw('
                products.id as product_id,
                products.name as product_name,
                SUM(CASE WHEN ticket_lines.is_correction THEN -ticket_lines.quantity ELSE ticket_lines.quantity END) as quantity,
                SUM(CASE WHEN ticket_lines.is_correction THEN -ticket_lines.unit_price * ticket_lines.quantity ELSE ticket_lines.unit_price * ticket_lines.quantity END) as revenue
            ')
            ->groupBy('products.id', 'products.name')
            ->orderByDesc('revenue')
            ->limit(10)
            ->get()
            ->map(fn ($row) => [
                'product_id' => (int) $row->product_id,
                'product_name' => $row->product_name,
                'quantity' => (int) $row->quantity,
                'revenue' => round((float) $row->revenue, 2),
            ])
            ->all();
    }
}
