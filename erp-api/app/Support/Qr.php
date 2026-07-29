<?php

namespace App\Support;

use Endroid\QrCode\Builder\Builder;
use Endroid\QrCode\Writer\PngWriter;

/**
 * Petit wrapper partagé autour d'endroid/qr-code — utilisé par EventTicketsMail (QR encodé en
 * data URI dans l'email) et EventTicketController::qr (même PNG servi tel quel pour
 * impression/téléchargement), pour ne pas dupliquer les options (size/margin) à deux endroits.
 */
class Qr
{
    public static function png(string $data, int $size = 240, int $margin = 10): string
    {
        return (new Builder())->build(writer: new PngWriter(), data: $data, size: $size, margin: $margin)->getString();
    }
}
