<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\AccountingExport;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Export comptable sur une période libre (voir Readme.md Todo → export pour le comptable), en
 * plus de "Rapports" (périodes jour/semaine/mois fixes, sans détail TVA) et de "Gestion des
 * tickets" (historique/réimpression, pas d'export) :
 * - CSV détaillé : une ligne par ticket, colonnes HT par taux de TVA — pour vérification/import
 *   manuel par le comptable.
 * - PDF de synthèse : totaux par taux de TVA et par moyen de paiement sur la période — ce qu'un
 *   comptable demande généralement en premier, sans avoir à ouvrir le CSV.
 * Même groupe de rôle que reports/summary et tickets (superviseur+, voir routes/api.php) : ces
 * montants sont sensibles, pas ouverts au rôle `user`.
 */
class AccountingExportController extends Controller
{
    public function csv(Request $request): StreamedResponse
    {
        [$from, $to] = $this->resolveRange($request);
        $tickets = AccountingExport::ticketsBetween($from, $to);
        $rates = $this->ratesPresent($tickets);

        $filename = "export-comptable_{$from->format('Y-m-d')}_{$to->format('Y-m-d')}.csv";

        return response()->streamDownload(function () use ($tickets, $rates) {
            $out = fopen('php://output', 'w');
            // BOM UTF-8 : ouverture directe dans Excel (fr) sans que les accents (é, à…) soient
            // mal interprétés.
            fwrite($out, "\xEF\xBB\xBF");

            $header = ['Date', 'N° ticket', 'Client', 'Source'];
            foreach ($rates as $rate) {
                $header[] = 'HT ' . $this->formatRate($rate) . '%';
            }
            array_push($header, 'TVA totale', 'Total TTC (brut)', 'Réduction', 'Net encaissé', 'Moyens de paiement');
            fputcsv($out, $header, ';');

            foreach ($tickets as $ticket) {
                $breakdown = AccountingExport::taxBreakdown($ticket);
                $gross = AccountingExport::grossTotal($ticket);
                $net = AccountingExport::netTotal($ticket);
                $payments = AccountingExport::paymentsByMethod($ticket);

                $row = [
                    $ticket->paid_at->format('d/m/Y H:i'),
                    $ticket->id,
                    $ticket->client ? "{$ticket->client->firstname} {$ticket->client->lastname}" : 'Comptant',
                    $this->sourceLabel($ticket->source),
                ];

                foreach ($rates as $rate) {
                    $row[] = number_format($breakdown[(string) $rate]['ht'] ?? 0, 2, '.', '');
                }

                $totalTva = array_sum(array_column($breakdown, 'tva'));
                $row[] = number_format($totalTva, 2, '.', '');
                $row[] = number_format($gross, 2, '.', '');
                $row[] = number_format($gross - $net, 2, '.', '');
                $row[] = number_format($net, 2, '.', '');
                $row[] = collect($payments)
                    ->map(fn ($amount, $name) => "{$name}: " . number_format($amount, 2, '.', '') . ' €')
                    ->implode('; ');

                fputcsv($out, $row, ';');
            }

            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public function pdf(Request $request)
    {
        [$from, $to] = $this->resolveRange($request);
        $tickets = AccountingExport::ticketsBetween($from, $to);

        $taxTotals = [];
        $paymentTotals = [];
        $grossTotal = 0.0;
        $netTotal = 0.0;

        foreach ($tickets as $ticket) {
            foreach (AccountingExport::taxBreakdown($ticket) as $key => $row) {
                $taxTotals[$key] ??= ['rate' => $row['rate'], 'ht' => 0.0, 'tva' => 0.0, 'ttc' => 0.0];
                $taxTotals[$key]['ht'] += $row['ht'];
                $taxTotals[$key]['tva'] += $row['tva'];
                $taxTotals[$key]['ttc'] += $row['ttc'];
            }

            foreach (AccountingExport::paymentsByMethod($ticket) as $name => $amount) {
                $paymentTotals[$name] = ($paymentTotals[$name] ?? 0) + $amount;
            }

            $grossTotal += AccountingExport::grossTotal($ticket);
            $netTotal += AccountingExport::netTotal($ticket);
        }

        uasort($taxTotals, fn (array $a, array $b) => $a['rate'] <=> $b['rate']);

        $html = view('pdf.accounting-export', [
            'from' => $from,
            'to' => $to,
            'ticketsCount' => $tickets->count(),
            'taxTotals' => $taxTotals,
            'paymentTotals' => $paymentTotals,
            'grossTotal' => $grossTotal,
            'netTotal' => $netTotal,
            'reduction' => $grossTotal - $netTotal,
            'company' => config('company'),
        ])->render();

        $options = new Options();
        $options->set('isRemoteEnabled', false);
        $dompdf = new Dompdf($options);
        $dompdf->loadHtml($html);
        $dompdf->setPaper('a4', 'portrait');
        $dompdf->render();

        $filename = "export-comptable_{$from->format('Y-m-d')}_{$to->format('Y-m-d')}.pdf";

        return response($dompdf->output(), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    /** @return array{0: Carbon, 1: Carbon} */
    private function resolveRange(Request $request): array
    {
        $data = $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
        ]);

        return [Carbon::parse($data['from'])->startOfDay(), Carbon::parse($data['to'])->endOfDay()];
    }

    /** Taux de TVA distincts présents dans les tickets exportés (pas seulement les taxes encore
     *  actives aujourd'hui — un export historique doit rester correct même si un taux a depuis
     *  été désactivé). @return list<float> */
    private function ratesPresent(Collection $tickets): array
    {
        $rates = [];
        foreach ($tickets as $ticket) {
            foreach (AccountingExport::taxBreakdown($ticket) as $key => $row) {
                $rates[$key] = $row['rate'];
            }
        }

        asort($rates);

        return array_values($rates);
    }

    /** "21" pour 21.0, "6.5" pour 6.5 — évite d'afficher "21.0%" dans l'en-tête CSV. */
    private function formatRate(float $rate): string
    {
        return rtrim(rtrim(number_format($rate, 2, '.', ''), '0'), '.');
    }

    private function sourceLabel(string $source): string
    {
        return match ($source) {
            'pos_restaurant' => 'POS Restaurant',
            'pos_vente_directe' => 'Vente directe',
            'self_order' => 'Self-order (QR)',
            'kiosk' => 'Kiosque',
            default => $source,
        };
    }
}
