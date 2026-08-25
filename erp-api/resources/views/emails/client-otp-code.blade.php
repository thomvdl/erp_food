<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Votre code de connexion</title>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1b1a15; background: #f4f4f2; padding: 24px;">
    <table role="presentation" width="100%" style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden;">
        <tr>
            <td style="background: #0f766e; color: #ffffff; padding: 20px 24px;">
                <h1 style="margin: 0; font-size: 20px;">Votre code de connexion</h1>
            </td>
        </tr>
        <tr>
            <td style="padding: 24px;">
                <p>Voici votre code à usage unique, valable 10 minutes :</p>

                <p style="text-align: center; margin: 24px 0;">
                    <span style="display: inline-block; padding: 12px 24px; background: #f4f4f2; border-radius: 8px; font-size: 28px; font-weight: bold; letter-spacing: 6px;">
                        {{ $code }}
                    </span>
                </p>

                <p style="color: #7c7b76; font-size: 13px;">
                    Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.
                </p>
            </td>
        </tr>
        @include('emails.partials.company-footer')
    </table>
</body>
</html>
