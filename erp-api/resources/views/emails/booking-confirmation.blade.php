<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Confirmation de votre réservation</title>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1b1a15; background: #f4f4f2; padding: 24px;">
    <table role="presentation" width="100%" style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden;">
        <tr>
            <td style="background: #0f766e; color: #ffffff; padding: 20px 24px;">
                <h1 style="margin: 0; font-size: 20px;">Réservation confirmée</h1>
                <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.85;">
                    Bonjour {{ $booking->client->firstname }},
                </p>
            </td>
        </tr>
        <tr>
            <td style="padding: 24px;">
                <p>Votre réservation a bien été enregistrée :</p>

                <table role="presentation" width="100%" style="margin-top: 12px; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 4px 0; color: #56554f;">Date</td>
                        <td style="padding: 4px 0; text-align: right; font-weight: bold;">
                            {{ \Illuminate\Support\Carbon::parse($booking->date)->translatedFormat('d/m/Y') }}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 4px 0; color: #56554f;">Heure</td>
                        <td style="padding: 4px 0; text-align: right; font-weight: bold;">
                            {{ substr($booking->hour, 0, 5) }}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 4px 0; color: #56554f;">Service</td>
                        <td style="padding: 4px 0; text-align: right; font-weight: bold;">
                            @switch($booking->type)
                                @case('breakfast') Petit déjeuner @break
                                @case('lunch') Déjeuner @break
                                @case('dinner') Souper @break
                            @endswitch
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 4px 0; color: #56554f;">Nombre de personnes</td>
                        <td style="padding: 4px 0; text-align: right; font-weight: bold;">
                            {{ $booking->number_of_guests }}
                        </td>
                    </tr>
                </table>

                <p style="color: #7c7b76; font-size: 13px; margin-top: 24px;">
                    À très bientôt !
                </p>
            </td>
        </tr>
        @include('emails.partials.company-footer')
    </table>
</body>
</html>
