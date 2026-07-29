<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>{{ $eventDate->event->name }}</title>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1b1a15; background: #f4f4f2; padding: 24px;">
    <table role="presentation" width="100%" style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden;">
        <tr>
            <td style="background: #0f766e; color: #ffffff; padding: 20px 24px;">
                <h1 style="margin: 0; font-size: 20px;">{{ $eventDate->event->name }}</h1>
                <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.85;">
                    {{ $eventDate->date->format('d/m/Y') }} à {{ substr($eventDate->start_hour, 0, 5) }}
                </p>
            </td>
        </tr>
        <tr>
            <td style="padding: 24px;">
                <p style="margin-top: 0;">
                    {{ count($tickets) > 1 ? 'Voici vos ' . count($tickets) . ' places' : 'Voici votre place' }},
                    présentez le code ou le QR à l'entrée.
                </p>

                @foreach ($tickets as $ticket)
                    <table role="presentation" width="100%" style="margin: 16px 0; border: 1px solid #e7e6e2; border-radius: 12px;">
                        <tr>
                            <td style="padding: 16px; text-align: center;">
                                <img src="{{ $ticket['qr'] }}" alt="QR code" width="160" height="160" style="display: block; margin: 0 auto 12px;">
                                <p style="margin: 0; font-size: 18px; font-weight: bold; letter-spacing: 2px;">{{ $ticket['code'] }}</p>
                            </td>
                        </tr>
                    </table>
                @endforeach

                <p style="color: #7c7b76; font-size: 13px;">Un code = une place, valable une seule fois.</p>
            </td>
        </tr>
    </table>
</body>
</html>
