<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Export comptable {{ $from->format('d/m/Y') }} — {{ $to->format('d/m/Y') }}</title>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1b1a15; padding: 32px;">
    <table role="presentation" width="100%" style="border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 24px;">
        <tr>
            <td>
                <h1 style="margin: 0; font-size: 20px; color: #0f766e;">
                    {{ $company['name'] ?? 'ERP v2' }}
                </h1>
                @if (!empty($company['address']))
                    <p style="margin: 2px 0 0; font-size: 12px; color: #56554f;">{{ $company['address'] }}</p>
                @endif
            </td>
            <td style="text-align: right;">
                <h2 style="margin: 0; font-size: 16px;">Export comptable</h2>
                <p style="margin: 2px 0 0; font-size: 12px; color: #56554f;">
                    Du {{ $from->format('d/m/Y') }} au {{ $to->format('d/m/Y') }}
                </p>
            </td>
        </tr>
    </table>

    <p style="font-size: 13px; color: #56554f;">
        {{ $ticketsCount }} ticket{{ $ticketsCount > 1 ? 's' : '' }} encaissé{{ $ticketsCount > 1 ? 's' : '' }} sur la période.
        Le détail ticket par ticket se trouve dans l'export CSV correspondant.
    </p>

    @if ($ticketsCount === 0)
        <p style="margin-top: 24px; font-size: 13px; color: #56554f;">Aucune vente sur cette période.</p>
    @else
        <h3 style="font-size: 14px; margin: 24px 0 8px;">Répartition par taux de TVA</h3>
        <table role="presentation" width="100%" style="border-collapse: collapse; font-size: 13px;">
            <tr style="background: #f4f4f2;">
                <td style="padding: 6px 8px; font-weight: bold; border-bottom: 1px solid #e7e6e2;">Taux</td>
                <td style="padding: 6px 8px; font-weight: bold; border-bottom: 1px solid #e7e6e2; text-align: right;">Base HT</td>
                <td style="padding: 6px 8px; font-weight: bold; border-bottom: 1px solid #e7e6e2; text-align: right;">TVA</td>
                <td style="padding: 6px 8px; font-weight: bold; border-bottom: 1px solid #e7e6e2; text-align: right;">TTC</td>
            </tr>
            @foreach ($taxTotals as $row)
                <tr>
                    <td style="padding: 6px 8px; border-bottom: 1px solid #e7e6e2;">{{ rtrim(rtrim(number_format($row['rate'], 2, '.', ''), '0'), '.') }}%</td>
                    <td style="padding: 6px 8px; border-bottom: 1px solid #e7e6e2; text-align: right;">{{ number_format($row['ht'], 2) }} €</td>
                    <td style="padding: 6px 8px; border-bottom: 1px solid #e7e6e2; text-align: right;">{{ number_format($row['tva'], 2) }} €</td>
                    <td style="padding: 6px 8px; border-bottom: 1px solid #e7e6e2; text-align: right;">{{ number_format($row['ttc'], 2) }} €</td>
                </tr>
            @endforeach
            <tr>
                <td style="padding: 6px 8px; font-weight: bold;">Total</td>
                <td style="padding: 6px 8px; font-weight: bold; text-align: right;">{{ number_format(array_sum(array_column($taxTotals, 'ht')), 2) }} €</td>
                <td style="padding: 6px 8px; font-weight: bold; text-align: right;">{{ number_format(array_sum(array_column($taxTotals, 'tva')), 2) }} €</td>
                <td style="padding: 6px 8px; font-weight: bold; text-align: right;">{{ number_format($grossTotal, 2) }} €</td>
            </tr>
        </table>

        <h3 style="font-size: 14px; margin: 24px 0 8px;">Répartition par moyen de paiement</h3>
        <table role="presentation" width="100%" style="border-collapse: collapse; font-size: 13px;">
            <tr style="background: #f4f4f2;">
                <td style="padding: 6px 8px; font-weight: bold; border-bottom: 1px solid #e7e6e2;">Moyen de paiement</td>
                <td style="padding: 6px 8px; font-weight: bold; border-bottom: 1px solid #e7e6e2; text-align: right;">Montant</td>
            </tr>
            @foreach ($paymentTotals as $name => $amount)
                <tr>
                    <td style="padding: 6px 8px; border-bottom: 1px solid #e7e6e2;">{{ $name }}</td>
                    <td style="padding: 6px 8px; border-bottom: 1px solid #e7e6e2; text-align: right;">{{ number_format($amount, 2) }} €</td>
                </tr>
            @endforeach
            <tr>
                <td style="padding: 6px 8px; font-weight: bold;">Total encaissé</td>
                <td style="padding: 6px 8px; font-weight: bold; text-align: right;">{{ number_format($netTotal, 2) }} €</td>
            </tr>
        </table>

        <table role="presentation" width="100%" style="border-collapse: collapse; font-size: 13px; margin-top: 24px;">
            <tr>
                <td style="padding: 4px 8px;">Total TTC brut (avant réduction)</td>
                <td style="padding: 4px 8px; text-align: right;">{{ number_format($grossTotal, 2) }} €</td>
            </tr>
            @if ($reduction > 0.004)
                <tr>
                    <td style="padding: 4px 8px;">Réductions (codes promo + points fidélité)</td>
                    <td style="padding: 4px 8px; text-align: right;">− {{ number_format($reduction, 2) }} €</td>
                </tr>
            @endif
            <tr>
                <td style="padding: 4px 8px; font-weight: bold; font-size: 15px;">Chiffre d'affaires net encaissé</td>
                <td style="padding: 4px 8px; font-weight: bold; font-size: 15px; text-align: right;">{{ number_format($netTotal, 2) }} €</td>
            </tr>
        </table>
    @endif

    <p style="margin-top: 32px; font-size: 11px; color: #9b9a94;">
        Document généré le {{ now()->format('d/m/Y à H:i') }} — usage comptable interne.
    </p>
</body>
</html>
