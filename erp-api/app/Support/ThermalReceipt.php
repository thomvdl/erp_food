<?php

namespace App\Support;

use App\Models\Param;
use App\Models\Printer as PrinterModel;
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
    /** Voir Paramètres > Réglages (App\Models\Param, clé/valeur libre) — IP modifiable sans
     *  redéploiement, contrairement à PRINTER_HOST (config/printer.php) qui reste le filet de
     *  secours si aucune ligne "ip_printer_kiosk" n'existe encore en base. Utilisé uniquement
     *  quand aucune App\Models\Printer précise n'est passée à print() (voir $printer ci-dessous) —
     *  ancien comportement (une seule imprimante pour tout le système), conservé pour les
     *  installations à un seul poste qui n'ont pas besoin de configurer plusieurs imprimantes. */
    private const PARAM_KEY = 'ip_printer_kiosk';

    /**
     * $printer : l'imprimante choisie par CE poste (voir ActivePrinterService côté erp-app/
     * erp_kiosk, TicketController::printThermal) — absente, retombe sur l'IP globale unique
     * (comportement historique, voir PARAM_KEY ci-dessus).
     */
    public static function print(Ticket $ticket, ?PrinterModel $printer = null): void
    {
        $host = $printer?->ip_address ?? (Param::where('name', self::PARAM_KEY)->value('value') ?: config('printer.host'));

        if (!$host) {
            throw new RuntimeException("Aucune imprimante thermique configurée (choisissez une imprimante pour ce poste, ou ajoutez un réglage \"" . self::PARAM_KEY . "\" dans Paramètres > Réglages, ou PRINTER_HOST).");
        }

        $port = $printer?->port ?? (int) config('printer.port', 9100);

        // Timeout court (5s) plutôt que le défaut de fsockopen (souvent 60s) : une imprimante
        // éteinte/injoignable ne doit pas laisser la requête HTTP pendre une minute.
        $connector = new NetworkPrintConnector($host, $port, 5);
        $escposPrinter = new Printer($connector);

        try {
            static::render($escposPrinter, $ticket, $printer);
        } finally {
            $escposPrinter->close();
        }
    }

    private static function render(Printer $printer, Ticket $ticket, ?PrinterModel $printerModel): void
    {
        $width = $printerModel?->chars_per_line ?? (int) config('printer.chars_per_line', 42);

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
        // Numéro de commande en gros (x3) — repéré au comptoir de loin, pas juste dans la ligne
        // de détail "Ticket n°... du ..." en taille normale juste en dessous (voir même logique
        // .ticket-receipt__order-number côté reçu navigateur/kiosque).
        $printer->setEmphasis(true);
        $printer->setTextSize(3, 3);
        $printer->text('N° ' . $ticket->id . "\n");
        $printer->setTextSize(1, 1);
        $printer->setEmphasis(false);
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
