<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Ticket #{{ $ticket->id }}</title>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1b1a15; background: #f4f4f2; padding: 24px;">
    <table role="presentation" width="100%" style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden;">
        <tr>
            <td style="background: #0f766e; color: #ffffff; padding: 20px 24px;">
                <h1 style="margin: 0; font-size: 20px;">Ticket #{{ $ticket->id }}</h1>
                <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.85;">
                    {{ $ticket->paid_at->format('d/m/Y à H:i') }}
                    @if ($ticket->table)
                        — Table {{ $ticket->table->label }}
                    @endif
                </p>
            </td>
        </tr>
        <tr>
            <td style="padding: 24px;">
                @php $total = $ticket->sections->flatMap->lines->sum(fn ($line) => $line->quantity * $line->unit_price); @endphp
                @foreach ($ticket->sections as $section)
                    <p style="margin: 16px 0 4px; font-weight: bold; color: #56554f;">{{ $section->name }}</p>
                    <table role="presentation" width="100%" style="border-collapse: collapse;">
                        @foreach ($section->lines as $line)
                            <tr>
                                <td style="padding: 4px 0; border-bottom: 1px solid #e7e6e2;">
                                    {{ $line->quantity }}× {{ $line->product->name }}
                                </td>
                                <td style="padding: 4px 0; border-bottom: 1px solid #e7e6e2; text-align: right; white-space: nowrap;">
                                    {{ number_format($line->quantity * $line->unit_price, 2) }} €
                                </td>
                            </tr>
                        @endforeach
                    </table>
                @endforeach

                <table role="presentation" width="100%" style="margin-top: 16px;">
                    <tr>
                        <td style="font-weight: bold; font-size: 16px;">Total</td>
                        <td style="font-weight: bold; font-size: 16px; text-align: right;">{{ number_format($total, 2) }} €</td>
                    </tr>
                </table>

                <p style="margin: 16px 0 4px; font-weight: bold; color: #56554f;">Paiement</p>
                @foreach ($ticket->payments as $payment)
                    <table role="presentation" width="100%">
                        <tr>
                            <td style="padding: 2px 0; color: #56554f;">{{ $payment->paymentMethod->name }}</td>
                            <td style="padding: 2px 0; text-align: right; color: #56554f;">{{ number_format($payment->value, 2) }} €</td>
                        </tr>
                    </table>
                @endforeach

                <p style="color: #7c7b76; font-size: 13px; margin-top: 24px;">Merci de votre visite !</p>
            </td>
        </tr>
    </table>
</body>
</html>
