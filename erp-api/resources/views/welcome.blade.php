<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ config('app.name', 'ERP v2') }} — Documentation API</title>
    <style>
        :root {
            --bg: #0f1115;
            --surface: #171a21;
            --surface-2: #1f232c;
            --border: #2a2f3a;
            --text: #e6e8eb;
            --text-muted: #9aa1ac;
            --accent: #6ea8fe;
            --get: #3fb950;
            --post: #6ea8fe;
            --put: #d29922;
            --delete: #f85149;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            background: var(--bg);
            color: var(--text);
            font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        header {
            padding: 2.5rem 1.5rem 1.5rem;
            border-bottom: 1px solid var(--border);
            text-align: center;
        }
        header h1 { margin: 0 0 .4rem; font-size: 1.6rem; }
        header p { margin: 0; color: var(--text-muted); }
        .wrap { max-width: 980px; margin: 0 auto; padding: 1.5rem; }
        .notice {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 1rem 1.25rem;
            margin-bottom: 2rem;
            font-size: .92rem;
            color: var(--text-muted);
        }
        .notice code { color: var(--accent); }
        nav.toc {
            display: flex;
            flex-wrap: wrap;
            gap: .5rem;
            margin-bottom: 2.5rem;
        }
        nav.toc a {
            color: var(--text-muted);
            text-decoration: none;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 999px;
            padding: .3rem .8rem;
            font-size: .85rem;
        }
        nav.toc a:hover { color: var(--text); border-color: var(--accent); }
        section { margin-bottom: 2.5rem; scroll-margin-top: 1rem; }
        section h2 {
            font-size: 1.05rem;
            margin: 0 0 .25rem;
            padding-bottom: .5rem;
            border-bottom: 1px solid var(--border);
        }
        section .desc { color: var(--text-muted); font-size: .88rem; margin: .5rem 0 1rem; }
        table { width: 100%; border-collapse: collapse; font-size: .88rem; }
        thead th {
            text-align: left;
            color: var(--text-muted);
            font-weight: 600;
            font-size: .75rem;
            text-transform: uppercase;
            letter-spacing: .03em;
            padding: .4rem .6rem;
        }
        tbody tr { background: var(--surface); }
        tbody tr:nth-child(even) { background: var(--surface-2); }
        td {
            padding: .6rem .6rem;
            border-top: 1px solid var(--border);
            vertical-align: top;
        }
        td:first-child { border-radius: 6px 0 0 6px; }
        td:last-child { border-radius: 0 6px 6px 0; }
        .methods { white-space: nowrap; }
        .m {
            display: inline-block;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: .72rem;
            font-weight: 700;
            padding: .1rem .4rem;
            border-radius: 4px;
            margin: 0 .2rem .2rem 0;
        }
        .m-get { color: var(--get); background: color-mix(in srgb, var(--get) 15%, transparent); }
        .m-post { color: var(--post); background: color-mix(in srgb, var(--post) 15%, transparent); }
        .m-put { color: var(--put); background: color-mix(in srgb, var(--put) 15%, transparent); }
        .m-delete { color: var(--delete); background: color-mix(in srgb, var(--delete) 15%, transparent); }
        code.path {
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: .85rem;
            color: var(--text);
        }
        .auth {
            display: inline-block;
            font-size: .72rem;
            font-weight: 600;
            padding: .1rem .5rem;
            border-radius: 999px;
            white-space: nowrap;
        }
        .auth-public { color: #3fb950; background: rgba(63,185,80,.12); }
        .auth-token { color: #d2a8ff; background: rgba(210,168,255,.12); }
        footer { text-align: center; color: var(--text-muted); font-size: .8rem; padding: 2rem 1rem 3rem; }
    </style>
</head>
<body>
    <header>
        <h1>{{ config('app.name', 'ERP v2') }} — API</h1>
        <p>Documentation des routes REST exposées par <code>erp-api</code></p>
    </header>

    <div class="wrap">
        <div class="notice">
            Base URL : <code>{{ url('/api') }}</code>. Sauf mention <strong>Public</strong>, toutes
            les routes exigent un en-tête <code>Authorization: Bearer &lt;token&gt;</code> obtenu via
            <code>POST /auth/login</code> (authentification Sanctum). Les routes marquées
            <strong>Public</strong> sont volontairement accessibles sans authentification — voir la
            description de chacune pour le raisonnement (mode QR self-order, écrans publics, QR
            imprimables...).
        </div>

        <nav class="toc">
            <a href="#auth">Authentification</a>
            <a href="#self-order">Mode QR self-order</a>
            <a href="#kiosque">Kiosque</a>
            <a href="#catalogue">Catalogue produit</a>
            <a href="#salles">Salles &amp; plan de salle</a>
            <a href="#identite">Identité &amp; accès</a>
            <a href="#clients">Clients</a>
            <a href="#caisse">Caisse &amp; tickets</a>
            <a href="#pos">POS Restaurant</a>
            <a href="#evenements">Événements</a>
            <a href="#reservations">Réservations</a>
        </nav>

        <section id="auth">
            <h2>Authentification</h2>
            <p class="desc">Seule <code>auth/login</code> est publique — tout le reste de l'API l'exige en amont.</p>
            <table>
                <thead><tr><th>Méthode</th><th>Route</th><th>Accès</th><th>Description</th></tr></thead>
                <tbody>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/auth/login</code></td><td><span class="auth auth-public">Public</span></td><td>Connexion par nom d'utilisateur + mot de passe ou par scan d'un QR personnel (barcode). Renvoie un token Sanctum.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/auth/logout</code></td><td><span class="auth auth-token">Token</span></td><td>Invalide le token courant.</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span></td><td><code class="path">/auth/me</code></td><td><span class="auth auth-token">Token</span></td><td>Utilisateur actuellement authentifié.</td></tr>
                </tbody>
            </table>
        </section>

        <section id="self-order">
            <h2>Mode QR self-order</h2>
            <p class="desc">Un client anonyme scanne le QR d'une table et compose sa commande depuis son propre téléphone — sans jamais s'authentifier. <code>qr_token</code> fait office de capacité scopée à cette seule table.</p>
            <table>
                <thead><tr><th>Méthode</th><th>Route</th><th>Accès</th><th>Description</th></tr></thead>
                <tbody>
                    <tr><td class="methods"><span class="m m-get">GET</span></td><td><code class="path">/self-order/{qr_token}</code></td><td><span class="auth auth-public">Public</span></td><td>Contexte de commande (produits du catalogue actif, infos table) pour un QR de table donné.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/self-order/{qr_token}/lines</code></td><td><span class="auth auth-public">Public</span></td><td>Envoie une commande. Passe directement en "demandée" en cuisine, jamais payée à ce stade.</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span></td><td><code class="path">/tables/{table}/qr</code></td><td><span class="auth auth-public">Public</span></td><td>PNG du QR code imprimable pour une table (encode l'URL self-order complète).</td></tr>
                </tbody>
            </table>
        </section>

        <section id="kiosque">
            <h2>Kiosque</h2>
            <p class="desc">Le mode kiosque (<code>erp_kiosk</code>) est un appareil authentifié classique — staff connecté, caisse ouverte.</p>
            <table>
                <thead><tr><th>Méthode</th><th>Route</th><th>Accès</th><th>Description</th></tr></thead>
                <tbody>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/kiosk-orders</code></td><td><span class="auth auth-token">Token</span></td><td>Crée le Ticket (encaissement immédiat) et l'Order cuisine en une seule requête.</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span></td><td><code class="path">/kiosk-orders/status</code></td><td><span class="auth auth-public">Public</span></td><td>Numéros de tickets kiosque en préparation / prêts — alimente l'écran public "suivi des commandes".</td></tr>
                </tbody>
            </table>
        </section>

        <section id="catalogue">
            <h2>Catalogue produit</h2>
            <table>
                <thead><tr><th>Méthode</th><th>Route</th><th>Accès</th><th>Description</th></tr></thead>
                <tbody>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-post">POST</span><span class="m m-put">PUT</span></td><td><code class="path">/product-categories[/{id}]</code></td><td><span class="auth auth-token">Token</span></td><td>CRUD catégories de produits (pas de suppression — champ <code>active</code>).</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-post">POST</span><span class="m m-put">PUT</span></td><td><code class="path">/product-catalogs[/{id}]</code></td><td><span class="auth auth-token">Token</span></td><td>CRUD catalogues produit (pas de suppression).</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/product-catalogs/{id}/activate-restaurant</code></td><td><span class="auth auth-token">Token</span></td><td>Définit le catalogue affiché en POS Restaurant.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/product-catalogs/{id}/activate-direct-sale</code></td><td><span class="auth auth-token">Token</span></td><td>Définit le catalogue affiché en vente directe.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/product-catalogs/{id}/activate-self-order</code></td><td><span class="auth auth-token">Token</span></td><td>Définit le catalogue affiché en self-order (QR + kiosque).</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-post">POST</span><span class="m m-put">PUT</span><span class="m m-delete">DELETE</span></td><td><code class="path">/products[/{id}]</code></td><td><span class="auth auth-token">Token</span></td><td>CRUD complet des produits.</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-post">POST</span><span class="m m-put">PUT</span></td><td><code class="path">/taxes[/{id}]</code></td><td><span class="auth auth-token">Token</span></td><td>CRUD taux de taxe (pas de suppression).</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span></td><td><code class="path">/payment-methods</code></td><td><span class="auth auth-token">Token</span></td><td>Liste des moyens de paiement.</td></tr>
                </tbody>
            </table>
        </section>

        <section id="salles">
            <h2>Salles &amp; plan de salle</h2>
            <table>
                <thead><tr><th>Méthode</th><th>Route</th><th>Accès</th><th>Description</th></tr></thead>
                <tbody>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-post">POST</span><span class="m m-put">PUT</span></td><td><code class="path">/rooms[/{id}]</code></td><td><span class="auth auth-token">Token</span></td><td>CRUD salles (Restaurant / Événement / Self-order — pas de suppression).</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-post">POST</span></td><td><code class="path">/rooms/{room}/tables</code></td><td><span class="auth auth-token">Token</span></td><td>Liste / création des éléments du plan de salle (tables, murs, textes libres).</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-put">PUT</span></td><td><code class="path">/tables/{id}</code></td><td><span class="auth auth-token">Token</span></td><td>Détail / modification d'un élément du plan (route "shallow", pas de suppression).</td></tr>
                </tbody>
            </table>
        </section>

        <section id="identite">
            <h2>Identité &amp; accès</h2>
            <table>
                <thead><tr><th>Méthode</th><th>Route</th><th>Accès</th><th>Description</th></tr></thead>
                <tbody>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-post">POST</span><span class="m m-put">PUT</span></td><td><code class="path">/roles[/{id}]</code></td><td><span class="auth auth-token">Token</span></td><td>CRUD rôles (pas de suppression).</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-post">POST</span><span class="m m-put">PUT</span></td><td><code class="path">/users[/{id}]</code></td><td><span class="auth auth-token">Token</span></td><td>CRUD utilisateurs (pas de suppression).</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/users/{id}/qr-code</code></td><td><span class="auth auth-token">Token</span></td><td>(Re)génère le QR de connexion personnel de l'utilisateur.</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span></td><td><code class="path">/users/{id}/qr</code></td><td><span class="auth auth-token">Token</span></td><td>PNG du QR de connexion.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/users/{id}/qr-code/email</code></td><td><span class="auth auth-token">Token</span></td><td>Envoie le QR de connexion par email à l'utilisateur.</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-post">POST</span><span class="m m-put">PUT</span></td><td><code class="path">/stations[/{id}]</code></td><td><span class="auth auth-token">Token</span></td><td>CRUD postes de cuisine (pas de suppression).</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-post">POST</span><span class="m m-put">PUT</span></td><td><code class="path">/passes[/{id}]</code></td><td><span class="auth auth-token">Token</span></td><td>CRUD passes de cuisine (pas de suppression).</td></tr>
                </tbody>
            </table>
        </section>

        <section id="clients">
            <h2>Clients</h2>
            <table>
                <thead><tr><th>Méthode</th><th>Route</th><th>Accès</th><th>Description</th></tr></thead>
                <tbody>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-post">POST</span></td><td><code class="path">/clients</code></td><td><span class="auth auth-token">Token</span></td><td>Liste / création de clients.</td></tr>
                </tbody>
            </table>
        </section>

        <section id="caisse">
            <h2>Caisse &amp; tickets</h2>
            <table>
                <thead><tr><th>Méthode</th><th>Route</th><th>Accès</th><th>Description</th></tr></thead>
                <tbody>
                    <tr><td class="methods"><span class="m m-get">GET</span></td><td><code class="path">/cash-sessions</code></td><td><span class="auth auth-token">Token</span></td><td>Liste des sessions de caisse.</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span></td><td><code class="path">/cash-sessions/active</code></td><td><span class="auth auth-token">Token</span></td><td>Session de caisse ouverte pour un <code>user_id</code> donné.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/cash-sessions</code></td><td><span class="auth auth-token">Token</span></td><td>Ouvre une session de caisse (fond de caisse initial).</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span></td><td><code class="path">/cash-sessions/{id}</code></td><td><span class="auth auth-token">Token</span></td><td>Détail d'une session de caisse.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/cash-sessions/{id}/close</code></td><td><span class="auth auth-token">Token</span></td><td>Clôture une session de caisse.</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span></td><td><code class="path">/tickets</code></td><td><span class="auth auth-token">Token</span></td><td>Liste des tickets encaissés.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/tickets</code></td><td><span class="auth auth-token">Token</span></td><td>Encaissement direct (vente comptoir).</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span></td><td><code class="path">/tickets/{id}</code></td><td><span class="auth auth-token">Token</span></td><td>Détail d'un ticket.</td></tr>
                </tbody>
            </table>
        </section>

        <section id="pos">
            <h2>POS Restaurant</h2>
            <p class="desc">Une table ouverte = une <code>Order</code> ; chaque envoi en cuisine crée une <code>OrderSection</code>.</p>
            <table>
                <thead><tr><th>Méthode</th><th>Route</th><th>Accès</th><th>Description</th></tr></thead>
                <tbody>
                    <tr><td class="methods"><span class="m m-get">GET</span></td><td><code class="path">/orders</code></td><td><span class="auth auth-token">Token</span></td><td>Liste des commandes en cours.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/orders</code></td><td><span class="auth auth-token">Token</span></td><td>Ouvre une table (crée une commande).</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span></td><td><code class="path">/orders/{id}</code></td><td><span class="auth auth-token">Token</span></td><td>Détail d'une commande.</td></tr>
                    <tr><td class="methods"><span class="m m-delete">DELETE</span></td><td><code class="path">/orders/{id}</code></td><td><span class="auth auth-token">Token</span></td><td>Annule une commande.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/orders/{id}/pay</code></td><td><span class="auth auth-token">Token</span></td><td>Encaisse une commande.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/orders/{id}/transfer</code></td><td><span class="auth auth-token">Token</span></td><td>Transfère une commande vers une autre table.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/orders/{id}/sections</code></td><td><span class="auth auth-token">Token</span></td><td>Crée une nouvelle section (nouvel envoi en cuisine).</td></tr>
                    <tr><td class="methods"><span class="m m-delete">DELETE</span></td><td><code class="path">/order-sections/{id}</code></td><td><span class="auth auth-token">Token</span></td><td>Supprime une section.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/order-sections/{id}/valider</code></td><td><span class="auth auth-token">Token</span></td><td>Valide une section (serveur).</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/order-sections/{id}/demander</code></td><td><span class="auth auth-token">Token</span></td><td>Envoie la section en cuisine.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/order-sections/{id}/marquer-fait</code></td><td><span class="auth auth-token">Token</span></td><td>Marque un poste comme fait (cuisine).</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/order-sections/{id}/envoyer</code></td><td><span class="auth auth-token">Token</span></td><td>Marque une passe comme envoyée (cuisine).</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/order-sections/{id}/lines</code></td><td><span class="auth auth-token">Token</span></td><td>Ajoute une ligne de produit à une section.</td></tr>
                    <tr><td class="methods"><span class="m m-put">PUT</span></td><td><code class="path">/order-lines/{id}</code></td><td><span class="auth auth-token">Token</span></td><td>Modifie une ligne (quantité, note...).</td></tr>
                    <tr><td class="methods"><span class="m m-delete">DELETE</span></td><td><code class="path">/order-lines/{id}</code></td><td><span class="auth auth-token">Token</span></td><td>Retire une ligne.</td></tr>
                </tbody>
            </table>
        </section>

        <section id="evenements">
            <h2>Événements</h2>
            <table>
                <thead><tr><th>Méthode</th><th>Route</th><th>Accès</th><th>Description</th></tr></thead>
                <tbody>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-post">POST</span><span class="m m-put">PUT</span><span class="m m-delete">DELETE</span></td><td><code class="path">/events[/{id}]</code></td><td><span class="auth auth-token">Token</span></td><td>CRUD complet des événements.</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span></td><td><code class="path">/event-dates</code></td><td><span class="auth auth-token">Token</span></td><td>Liste des dates d'événement.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/events/{id}/dates</code></td><td><span class="auth auth-token">Token</span></td><td>Ajoute une date à un événement.</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-put">PUT</span><span class="m m-delete">DELETE</span></td><td><code class="path">/event-dates/{id}</code></td><td><span class="auth auth-token">Token</span></td><td>Détail / modification / suppression d'une date.</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-post">POST</span><span class="m m-put">PUT</span><span class="m m-delete">DELETE</span></td><td><code class="path">/event-tickets[/{id}]</code></td><td><span class="auth auth-token">Token</span></td><td>CRUD des billets vendus pour une date d'événement.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/event-tickets/validate</code></td><td><span class="auth auth-token">Token</span></td><td>Valide un billet à l'entrée par son code (voir <code>erp_validate_event</code>).</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/event-tickets/{id}/assign-table</code></td><td><span class="auth auth-token">Token</span></td><td>Assigne une table à un billet.</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span></td><td><code class="path">/event-tickets/{id}/qr</code></td><td><span class="auth auth-public">Public</span></td><td>PNG du code de validation, servi brut pour la fenêtre d'impression (ne peut pas joindre de Bearer token).</td></tr>
                </tbody>
            </table>
        </section>

        <section id="reservations">
            <h2>Réservations</h2>
            <table>
                <thead><tr><th>Méthode</th><th>Route</th><th>Accès</th><th>Description</th></tr></thead>
                <tbody>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-post">POST</span></td><td><code class="path">/bookings</code></td><td><span class="auth auth-token">Token</span></td><td>Liste / création de réservations de salle.</td></tr>
                    <tr><td class="methods"><span class="m m-get">GET</span><span class="m m-put">PUT</span><span class="m m-delete">DELETE</span></td><td><code class="path">/bookings/{id}</code></td><td><span class="auth auth-token">Token</span></td><td>Détail / modification / suppression d'une réservation.</td></tr>
                    <tr><td class="methods"><span class="m m-post">POST</span></td><td><code class="path">/bookings/{id}/validate</code></td><td><span class="auth auth-token">Token</span></td><td>Valide une réservation.</td></tr>
                </tbody>
            </table>
        </section>
    </div>

    <footer>
        Généré à partir de <code>routes/api.php</code> — voir <code>Readme.md</code> et <code>docs/README.md</code> à la racine du dépôt pour le contexte fonctionnel complet.
    </footer>
</body>
</html>
