<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Votre code de connexion</title>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #0E1733; background: #f4f4f2; padding: 24px;">
    <table role="presentation" width="100%" style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden;">
        <tr>
            <td style="background: #FD5E02; color: #ffffff; padding: 20px 24px;">
                <h1 style="margin: 0; font-size: 20px;">Votre code de connexion</h1>
            </td>
        </tr>
        <tr>
            <td style="padding: 24px; text-align: center;">
                <p style="margin: 0 0 16px; color: #56554f;">Utilisez ce code pour vous connecter à votre compte :</p>
                <p style="margin: 0 0 16px; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0E1733;">
                    {{ $code }}
                </p>
                <p style="color: #7c7b76; font-size: 13px; margin-top: 24px;">
                    Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.
                </p>
            </td>
        </tr>
        @include('emails.partials.company-footer')
    </table>
</body>
</html>
