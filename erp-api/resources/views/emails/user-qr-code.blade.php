<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>QR de connexion</title>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1b1a15; background: #f4f4f2; padding: 24px;">
    <table role="presentation" width="100%" style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden;">
        <tr>
            <td style="background: #0f766e; color: #ffffff; padding: 20px 24px;">
                <h1 style="margin: 0; font-size: 20px;">Votre QR code de connexion</h1>
            </td>
        </tr>
        <tr>
            <td style="padding: 24px; text-align: center;">
                <p style="margin-top: 0; text-align: left;">
                    Bonjour {{ $user->username }},<br>
                    présente ce QR code à l'écran de connexion pour t'identifier sans mot de passe.
                </p>

                <img src="{{ $qr }}" alt="QR code" width="200" height="200" style="display: block; margin: 16px auto;">

                <p style="color: #7c7b76; font-size: 13px; text-align: left;">
                    Ce QR est personnel — ne le partage pas. En cas de perte, régénère-le depuis la fiche
                    utilisateur (l'ancien cessera de fonctionner).
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
