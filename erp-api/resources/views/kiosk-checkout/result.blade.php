<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ config('app.name') }}</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; text-align: center; }
        .card { max-width: 420px; }
        .icon { font-size: 48px; }
        p.hint { color: #94a3b8; }
    </style>
</head>
<body>
    <div class="card">
        @if ($status === 'success')
            <p class="icon">✅</p>
            <h1>Paiement reçu</h1>
        @else
            <p class="icon">✕</p>
            <h1>Paiement annulé</h1>
        @endif
        <p class="hint">Vous pouvez fermer cette page et regarder l'écran du kiosque.</p>
    </div>
</body>
</html>
