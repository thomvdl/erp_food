{{-- Pied commun aux emails clients (ticket, réservation, billets d'événement) — voir config/company.php. --}}
@if (config('company.name') || config('company.address') || config('company.phone'))
<tr>
    <td style="padding: 16px 24px; background: #f4f4f2; border-top: 1px solid #e7e6e2; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #9c9b95;">
            @if (config('company.name'))
                <strong>{{ config('company.name') }}</strong><br>
            @endif
            {{ implode(' — ', array_filter([config('company.address'), config('company.phone')])) }}
        </p>
    </td>
</tr>
@endif
