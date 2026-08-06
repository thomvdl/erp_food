<?php

namespace App\Support;

use App\Models\Booking;
use Illuminate\Support\Carbon;

/**
 * Génère le contenu .ics d'une réservation — utilisé à la fois en pièce jointe
 * (BookingConfirmationMail) et par le lien de téléchargement direct exposé aux boutons
 * "Ajouter à Apple/Outlook Calendar" de l'email (BookingController::ics), d'où l'extraction :
 * les deux doivent produire un fichier identique.
 */
class BookingIcs
{
    public const TYPE_LABELS = [
        'breakfast' => 'Petit déjeuner',
        'lunch' => 'Déjeuner',
        'dinner' => 'Souper',
    ];

    /**
     * Pas de champ "durée" sur Booking (juste une heure de début) — 2h est une estimation
     * raisonnable pour un service à table, suffisante pour que l'événement apparaisse au bon
     * endroit dans un calendrier sans prétendre à une précision qu'on n'a pas.
     */
    private const DEFAULT_DURATION_HOURS = 2;

    public static function start(Booking $booking): Carbon
    {
        return Carbon::parse($booking->date->format('Y-m-d') . ' ' . $booking->hour);
    }

    public static function end(Booking $booking): Carbon
    {
        return static::start($booking)->copy()->addHours(self::DEFAULT_DURATION_HOURS);
    }

    public static function title(Booking $booking): string
    {
        return 'Réservation — ' . (config('company.name') ?: 'ERP v2');
    }

    public static function description(Booking $booking): string
    {
        return sprintf(
            'Réservation (%s) pour %d personne%s chez %s.',
            self::TYPE_LABELS[$booking->type] ?? $booking->type,
            $booking->number_of_guests,
            $booking->number_of_guests > 1 ? 's' : '',
            config('company.name') ?: 'ERP v2',
        );
    }

    /**
     * Heure "flottante" (pas de Z ni de TZID) : ce projet ne gère aucun fuseau horaire explicite
     * ailleurs (voir config/app.php, timezone figé à UTC), donc l'heure fournie est interprétée
     * comme l'heure locale de qui l'ouvre, ce qui reste correct tant que client et établissement
     * sont dans le même fuseau.
     */
    public static function build(Booking $booking): string
    {
        $start = static::start($booking);
        $end = static::end($booking);
        $companyName = config('company.name') ?: 'ERP v2';

        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//' . $companyName . '//Reservation//FR',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            'UID:booking-' . $booking->id . '@erp-v2',
            'DTSTAMP:' . now('UTC')->format('Ymd\THis\Z'),
            'DTSTART:' . $start->format('Ymd\THis'),
            'DTEND:' . $end->format('Ymd\THis'),
            'SUMMARY:' . static::escape(static::title($booking)),
            'DESCRIPTION:' . static::escape(static::description($booking)),
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
