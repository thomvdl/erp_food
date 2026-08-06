<?php

namespace App\Support;

use App\Models\Ticket;
use Mike42\Escpos\PrintConnectors\NetworkPrintConnector;
use Mike42\Escpos\Printer;
use RuntimeException;

/**
 * Impression directe sur une imprimante thermique réseau, en ESC/POS (port raw 9100 —
 * "JetDirect"/AppSocket, standard supporté par la quasi-totalité des imprimantes tickets
 * réseau). Vient en plus de l'impression navigateur existante (voir ticket-receipt.ts,
 * window.print()), qui reste la solution par défaut sans matériel requis : celle-ci est une
 * option supplémentaire déclenchée à la demande depuis la page ticket.
 */
class ThermalReceipt
{
    public static function print(Ticket $ticket): void
    {
        $host = config('printer.host');

        if (!$host) {
            throw new RuntimeException('Aucune imprimante thermique configurée (PRINTER_HOST manquant).');
        }

        // Timeout court (5s) plutôt que le défaut de fsockopen (souvent 60s) : une imprimante
        // éteinte/injoignable ne doit pas laisser la requête HTTP pendre une minute.
        $connector = new NetworkPrintConnector($host, (int) config('printer.port', 9100), 5);
        $printer = new Printer($connector);

        try {
            static::render($printer, $ticket);
        } finally {
            $printer->close();
        }
    }

    private static function render(Printer $printer, Ticket $ticket): void
    {
        $width = (int) config('printer.chars_per_line', 42);

        $printer->setJustification(Printer::JUSTIFY_CENTER);

        if ($companyName = config('company.name')) {
            $printer->setEmphasis(true);
            $printer->text($companyName . "\n");
            $printer->setEmphasis(false);
        }
        if ($address = config('company.address')) {
            $printer->text($address . "\n");
        }
        if ($phone = config('company.phone')) {
            $printer->text($phone . "\n");
        }

        $printer->feed();
        $printer->text('Ticket n°' . $ticket->id . ' du ' . $ticket->paid_at->format('d/m/Y H:i') . "\n");
        if ($ticket->table) {
            $printer->text('Table ' . $ticket->table->label . "\n");
        }
        $printer->text($ticket->client ? 'Client : ' . $ticket->client->firstname . ' ' . $ticket->client->lastname : 'CLIENT COMPTANT');
        $printer->text("\n");

        $printer->setJustification(Printer::JUSTIFY_LEFT);
        $printer->text(str_repeat('-', $width) . "\n");

        $total = 0;
        $multiSection = $ticket->sections->count() > 1;

        foreach ($ticket->sections as $section) {
            if ($multiSection) {
                $printer->text($section->name . "\n");
            }
            foreach ($section->lines as $line) {
                $lineTotal = $line->quantity * $line->unit_price;
                $total += $lineTotal;
                $label = $line->quantity . 'x ' . $line->product->name;
                $value = number_format($lineTotal, 2) . ' EUR';
                $printer->text(static::formatLine($label, $value, $width) . "\n");
            }
        }

        $printer->text(str_repeat('-', $width) . "\n");
        $printer->setEmphasis(true);
        $printer->text(static::formatLine('TOTAL TTC', number_format($total, 2) . ' EUR', $width) . "\n");
        $printer->setEmphasis(false);
        $printer->text("\n");

        foreach ($ticket->payments as $payment) {
            $printer->text(static::formatLine($payment->paymentMethod->name ?? '—', number_format($payment->value, 2) . ' EUR', $width) . "\n");
        }

        $printer->feed();
        $printer->setJustification(Printer::JUSTIFY_CENTER);
        $printer->text("Merci de votre visite !\n");
        $printer->feed(2);
        $printer->cut();
    }

    /** Aligne une étiquette à gauche et une valeur à droite sur une largeur fixe (caractères) —
     *  tronque l'étiquette si besoin plutôt que de déborder sur plusieurs lignes (peu lisible
     *  sur un papier 42-48 caractères de large). */
    private static function formatLine(string $label, string $value, int $width): string
    {
        $label = mb_substr($label, 0, max($width - mb_strlen($value) - 1, 1));
        $padding = max($width - mb_strlen($label) - mb_strlen($value), 1);

        return $label . str_repeat(' ', $padding) . $value;
    }
}
