# ERP v2

ERP maison pour un établissement qui fait à la fois vente directe (snack/comptoir), restaurant
avec service à table, et location de salle pour événements. Quatre applications séparées
partageant une seule base de données et une seule API.

## Architecture

| App | Rôle | Stack | Port (dev) |
|---|---|---|---|
| `erp-api` | API REST + diffusion temps réel | Laravel 13 / PHP 8.4 / MySQL 8.4 | 19001 |
| `erp-api` (service `reverb`) | Serveur WebSocket (Laravel Reverb) | même image que `erp-api` | 19004 |
| `erp-app` | Back-office admin (POS, Paramètres, Événements, Réservations, Caisse, Tickets) | Angular 21 | 19002 |
| `erp_validate_event` | Kiosque : validation d'entrée événement par QR code | Angular 22 | 19003 |
| `erp_kitchen_display` | Kiosque : écran cuisine (postes + passes) | Angular 22 | 19005 |

Les trois apps Angular sont des **kiosques/écrans dédiés** (pas d'authentification multi-rôle
fine — voir Todo) qui parlent toutes à la même `erp-api`. `erp-app` et `erp_kitchen_display`
s'abonnent en plus au serveur `reverb` via Laravel Echo pour se synchroniser en temps réel entre
eux (voir plus bas).

Adminer (client web MySQL) est aussi lancé par `docker-compose.yml`, sur le port 19080 —
pratique pour inspecter la base pendant le développement.

## Démarrer le projet

```bash
cp .env.example .env      # déjà fait si vous lisez ceci depuis un clone existant
docker compose up -d --build
```

- API : http://localhost:19001
- Back-office (`erp-app`) : http://localhost:19002
- Validation événement (`erp_validate_event`) : http://localhost:19003
- Kitchen display (`erp_kitchen_display`) : http://localhost:19005
- Adminer : http://localhost:19080 (serveur `db`, voir `.env` pour les identifiants)

Au premier démarrage, `docker/entrypoint.sh` du conteneur `api` lance automatiquement
`migrate` + les seeders de base (rôles, stations, passes, taxes, catégories/catalogues produit,
moyens de paiement, utilisateur admin). Identifiants admin par défaut définis dans `.env`
(`ADMIN_USERNAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD`, `admin` / `admin@erp.local` / `password`).
Mettre `DEMO=true` dans `.env` avant le premier démarrage pour peupler aussi un plan de salle,
des clients et un catalogue produit de démonstration (`DemoSeeder`).

**Piège connu** : `erp-api` (contrairement aux 3 apps Angular, bind-mountées et rechargées à
chaud) n'a **aucun bind mount** — le code PHP est cuit dans l'image au build. Toute modification
côté `erp-api`/`routes`/migrations nécessite `docker compose build api reverb && docker compose
up -d api reverb` pour être prise en compte par les conteneurs déjà démarrés.

## Temps réel (Laravel Echo / Reverb)

Un seul canal public Reverb, `kitchen`, événement `order.updated` (voir
`App\Events\OrderKitchenUpdated`), diffusé à **chaque mutation d'une commande** (table ouverte,
section créée/validée/demandée/marquée faite/envoyée/supprimée, produit ajouté/modifié/retiré,
commande payée/annulée). Deux familles d'abonnés :

- `erp_kitchen_display` (`kitchen-board.ts`) : refetch générique de la liste à chaque événement.
- `erp-app` POS - Restaurant (`table-select.ts`, `order-builder.ts`) : `table-select.ts` refetch
  l'occupation des tables à chaque événement ; `order-builder.ts` ne refetch que si l'id de
  commande correspond à celle actuellement ouverte — permet à plusieurs instances de POS -
  Restaurant (plusieurs serveurs, plusieurs postes) de rester synchronisées sans recharger la
  page, y compris quand une commande est payée ou annulée depuis un autre poste.

`ShouldBroadcastNow` (pas de queue worker actif dans ce projet) : la diffusion est synchrone,
dans la même requête HTTP que la mutation qui la déclenche.

## Base de données

Conventions communes : `active` (booléen, défaut `true`) sur les tables de référence listées
ci-dessous signifie qu'il n'y a **plus de suppression possible** depuis l'app — seulement une
désactivation. Les composants qui affichent ces entités (listes déroulantes, plans de salle...)
n'affichent que les lignes actives (sauf exception documentée au cas par cas, ex. filtre
d'historique). `slug` est dérivé automatiquement de `name` à la création (voir `HasSlug`).

**Identité / accès**
- `roles` : name, slug, active
- `users` : username, password, email, barcode (secret du QR de connexion), active
- `role_user` (pivot) : user_id, role_id

**Cuisine**
- `stations` : name, slug, passe_id (nullable — choisi depuis le formulaire Station ; plusieurs
  stations peuvent partager le même passe), active
- `passes` : name, slug, active

**Catalogue produit**
- `payment_methods` : name, slug, active
- `taxes` : slug, value, active
- `product_categories` : name, slug, active
- `product_catalogs` : name, slug, active, active_restaurant, active_direct_sale (ces deux
  derniers sont indépendants de `active` : ils désignent lequel des catalogues *actifs* est
  actuellement affiché par contexte POS — restaurant et vente directe peuvent chacun avoir leur
  propre catalogue affiché en même temps)
- `products` : name, slug, description, price, sku, active, tax_id, station_id,
  product_category_id — plus `catalog_product` (pivot many-to-many vers `product_catalogs`)

**Clients**
- `clients` : firstname, lastname, email, phone

**Plan de salle**
- `rooms` : name, slug, type (`restaurant` | `event`), active
- `tables` : type, label, pos_left, pos_top, width, height, room_id, active

**POS - Restaurant (commande en cours, avant paiement)**
- `orders` : state (send → ask → do → seed → done, jamais atteint pour l'instant — voir plus
  bas), client_id (nullable), table_id, number_of_guests
- `order_sections` : name, state (en_attente → send → ask → do → seed — "en_attente" = pas
  encore validée, avant même d'entrer dans le cycle nommé ; "done" jamais atteint), order_id
- `order_lines` : quantity, product_id, order_section_id, done (le poste a préparé cette ligne —
  suivi par ligne, pas par section, une section peut mélanger plusieurs postes), sent (le passe a
  expédié cette ligne — idem par ligne, une section peut mélanger plusieurs passes)

**Tickets (commande payée — figé, lecture seule)**
- `tickets` : paid_at, client_id (nullable), table_id (nullable — vente directe n'a pas de table)
- `ticket_sections` : name, ticket_id
- `ticket_lines` : quantity, unit_price (figé au prix du produit au moment du paiement),
  product_id, ticket_section_id
- `ticket_payments` : value, payment_method_id, ticket_id, user_id (nullable), cash_session_id
  (nullable) — un ticket peut avoir plusieurs paiements (règlement partagé espèces/carte)

**Événements**
- `events` : name, slug, active
- `event_dates` : date, start_hour, event_id, room_id (nullable — placement libre si absent),
  number_place_limit (nullable), active
- `event_tickets` : event_date_id, client_id (nullable), table_id (nullable — attribué au
  check-in si placement strict), validation_code, validated_at (nullable)

**Réservations**
- `bookings` : client_id, number_of_guests, type (`breakfast` | `lunch` | `dinner`), date, hour,
  validated_at (nullable)

**Caisse**
- `cash_sessions` : user_id, opening_amount, opened_at, closing_amount (nullable),
  expected_amount (nullable), discrepancy (nullable), closed_at (nullable),
  closed_by_user_id (nullable), note (nullable)
- `cash_session_counts` : cash_session_id, payment_method_id, expected_amount, counted_amount,
  discrepancy (détail du comptage à la fermeture, par moyen de paiement)

## ERP_APP (back-office)

- ✅ Dashboard
    1. ✅ Afficher des stats

- ✅ POS - Vente directe
    1. ✅ Vente directe de produits
    2. ✅ Possibilité de sélectionner un client (optionnel)
    3. ✅ Paiements

- ✅ POS - Restaurant
    1. ✅ Affiche les plans de salle avec un sélecteur de salle (uniquement les salles de type
       resto) et la possibilité d'ouvrir une table avec le nombre de personnes
    2. ✅ Affiche le POS une fois la table ouverte pour sélectionner des produits
    3. ✅ Sélectionner des produits et les séparer en sections, pouvoir ajouter des sections
       (section 1, section 2, ...)
    4. ✅ Une fois les produits sélectionnés — repasser sur la sélection des tables (home POS -
       Restaurant)
    5. ✅ Paiement avec possibilité de payer une partie en espèces et une partie en Bancontact —
       affiche le rendu en espèces
    6. ✅ Possibilité d'imprimer le ticket de caisse (mise en page façon vrai ticket de caisse) et
       de l'envoyer par email si un client est sélectionné
    7. ✅ Chaque section suit un cycle (en_attente → send → ask → do → seed → done, "en_attente" =
       pas encore validée, "done" jamais atteint pour l'instant) :
        - ✅ valider → send → envoyée sur le kitchen display
        - ✅ demander en cuisine → ask → demande la section en cuisine
        - ✅ fait → do → la station correspondant au produit marque la section comme faite (par
          ligne, pas toute la section si elle mélange plusieurs postes)
        - ✅ envoyer → seed → le passe correspondant marque la section comme envoyée (par ligne
          aussi, si la section mélange plusieurs passes)
        - done (jamais atteint, réservé pour une étape future — ex. "physiquement servie en
          salle")
    8. ✅ Synchronisation temps réel entre plusieurs instances de POS - Restaurant (Laravel
       Echo/Reverb) : ouverture/libération d'une table, ajout de produit, section validée, et
       paiement se répercutent en direct sur les autres postes ouverts sur la même commande ou
       sur l'écran de sélection de table, sans recharger la page

- ✅ Gestion des tickets
    1. ✅ Historique des tickets payés (filtre par jour, par client)
    2. ✅ Détail d'un ticket (`/tickets/:id`)
    3. ✅ Réimpression d'un ticket — consultation et réimpression uniquement, pas de modification
       ni de suppression (un ticket payé est une pièce comptable figée)

- ✅ Event
    1. ✅ Vendre des places (liées à un client) pour un événement, créer un code de validation,
       possibilité de l'envoyer par email
    2. ✅ Liste des places vendues avec modification et suppression
    3. ✅ Valider la présence avec le code de validation et attribuer une place (si placement
       strict, room_id disponible)
    4. ✅ Affichage d'une salle avec les places prises (room)

- ✅ Réservation
    1. ✅ Enregistrer une réservation (client, type, date, heure au quart d'heure, nombre de
       personnes) — type enum (petit-déjeuner, déjeuner, souper)
    2. ✅ Liste des réservations avec tri et filtre par jour
    3. ✅ Valider la réservation d'un client

- ✅ Produits
    1. ✅ Gestion des produits en vente
    2. ✅ Possibilité de tri et de filtre

- ✅ Ouverture / Fermeture de caisse
    1. ✅ Ouverture de session avec montant en cash
    2. ✅ Fermeture : validation du cash et des autres moyens de paiement
    3. ✅ Liste des fermetures avec détail

- ✅ Paramètres
    1. ✅ Gérer les salles et les tables (position des tables, ajout de salle)
    2. ✅ Gérer les catégories de produits
    3. ✅ Gérer les catalogues de produits (activer un catalogue par contexte POS)
    4. ✅ Gérer les utilisateurs et les différents rôles (CRUD complet, mais pas encore de
       permissions différentes par rôle — voir Todo)
    5. ✅ Gestion des produits
    6. ✅ Gérer les stations (CRUD + choix du passe de chaque station)
    7. ✅ Gérer les passes (CRUD)
    8. ✅ Plus de suppression pure sur salles/tables/catégories/catalogues/utilisateurs/
       rôles/stations/taxes/passes — remplacée par une case "Actif" (activer/désactiver), pour
       éviter les suppressions en cascade sur des entités très référencées ailleurs dans l'app

## ✅ ERP Validate event

- ✅ Sectionner un événement (plusieurs dates)
- ✅ Valider les places par QR code
- ✅ Placer les gens si événement avec placement strict

## ✅ Kitchen display

- ✅ Possibilité de voir Tout
- ✅ Tous les postes, poste par poste
- ✅ Toutes les passes, passe par passe (chaque station pointe vers son passe, plusieurs stations
  peuvent partager le même passe)
- ✅ Marquer comme fait dans les postes (uniquement les postes — pas les passes)
- ✅ Marquer comme envoyé dans les passes (uniquement les passes — pas les postes)

## Todo

- Définir ce qui est disponible de faire avec les différents rôles utilisateur (permissions par
  rôle — actuellement tout utilisateur connecté à `erp-app` a accès à tout)

Mettre à jours le readme 
et faire un doc complètte du projet 
