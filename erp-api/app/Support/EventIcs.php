<?php

namespace App\Support;

use App\Models\EventDate;
use Illuminate\Support\Carbon;

/**
 * Génère le contenu .ics d'une occurrence d'événement — même principe que App\Support\BookingIcs
 * (voir ce fichier), utilisé en pièce jointe par EventTicketsMail. Un seul événement calendrier
 * pour toutes les places d'une même vente (elles partagent la même date/heure), avec la liste
 * des codes en description — pas de QR intégré : aucun client calendrier (Google/Apple/Outlook)
 * ne rend fiablement une image scannable dans une description d'événement, contrairement au
 * corps de l'email qui, lui, affiche déjà chaque QR normalement.
 */
class EventIcs
{
    /**
     * Pas de champ "durée"/heure de fin sur EventDate (juste une heure de début) — 3h est une
     * estimation raisonnable pour un événement, suffisante pour que l'entrée apparaisse au bon
     * endroit dans un calendrier sans prétendre à une précision qu'on n'a pas.
     */
    private const DEFAULT_DURATION_HOURS = 3;

    public static function start(EventDate $eventDate): Carbon
    {
        return Carbon::parse($eventDate->date->format('Y-m-d') . ' ' . $eventDate->start_hour);
    }

    public static function end(EventDate $eventDate): Carbon
    {
        return static::start($eventDate)->copy()->addHours(self::DEFAULT_DURATION_HOURS);
    }

    /**
     * Heure "flottante" (pas de Z ni de TZID) — même choix et même raison que BookingIcs.
     *
     * @param array<int, string> $codes Codes de validation des places vendues (voir EventTicketsMail).
     */
    public static function build(EventDate $eventDate, array $codes): string
    {
        $start = static::start($eventDate);
        $end = static::end($eventDate);
        $eventName = $eventDate->event->name;

        $description = count($codes) > 1
            ? 'Vos codes de places : ' . implode(', ', $codes) . '. Présentez un code ou son QR (voir email) à l\'entrée.'
            : "Votre code de place : {$codes[0]}. Présentez ce code ou son QR (voir email) à l'entrée.";

        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//' . (config('company.name') ?: 'ERP v2') . '//Event//FR',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            'UID:event-date-' . $eventDate->id . '@erp-v2',
            'DTSTAMP:' . now('UTC')->format('Ymd\THis\Z'),
            'DTSTART:' . $start->format('Ymd\THis'),
            'DTEND:' . $end->format('Ymd\THis'),
            'SUMMARY:' . static::escape($eventName),
            'DESCRIPTION:' . static::escape($description),
        ];

        if (config('company.address')) {
            $lines[] = 'LOCATION:' . static::escape(config('company.address'));
        }

        $lines[] = 'STATUS:CONFIRMED';
        $lines[] = 'END:VEVENT';
        $lines[] = 'END:VCALENDAR';

        return implode("\r\n", $lines) . "\r\n";
    }

    private static function escape(string $value): string
    {
        return str_replace(['\\', ',', ';', "\n"], ['\\\\', '\\,', '\\;', '\\n'], $value);
    }
}
