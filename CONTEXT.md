# CONTEXTE — ERP v2 (restaurant / snack / vente directe)

> Doc vivante à lire en premier en reprenant le projet, sur le modèle de `ERP/CONTEXT.md` (le repo `ERP/` original, conservé tel quel à côté). Mise à jour au fil de l'eau.

## Vue d'ensemble

Repartir de zéro sur un ERP restaurant/snack/vente directe, avec le schéma de données esquissé dans `Readme.md` comme point de départ (au lieu de faire évoluer le modèle de données de `ERP/`, jugé trop contraint par son historique). Même stack, même conventions Docker que `ERP/` — voir [[project-erp-overview]] pour comparaison.

| Dossier | Rôle | Stack |
|---|---|---|
| `erp-api/` | API backend | Laravel 13, PHP 8.4, MySQL 8.4 |
| `erp-app/` | App principale | Angular 21, standalone, zoneless par défaut (pas de zone.js dans les dépendances) |
| `erp_validate_event/` | App dédiée contrôle d'accès événements (2026-07-29) | Angular 22, standalone, zoneless — même style que `erp-app` (styles.css copié), même backend `erp-api` |

Quatre dépôts indépendants (pas de kitchen-display pour l'instant, contrairement à `ERP/` — pas demandé, à ajouter plus tard si besoin).

## Démarrage rapide

```bash
cp .env.example .env   # déjà fait, .env versionné localement avec une APP_KEY générée
docker compose up --build
```

| Service | URL |
|---|---|
| App principale | http://localhost:19002 |
| API | http://localhost:19001 |
| Contrôle d'accès événements (`erp_validate_event`) | http://localhost:19003 |
| Adminer (DB) | http://localhost:19080 |
| MySQL (accès direct) | localhost:19306 |

Ports en plage **19xxx** (volontairement distincte de `ERP/` qui occupe 18xxx, et de `mise-api` sur 8000, tous sur la même machine).

## Ce qui est construit (2026-07-27)

### Backend (`erp-api`)
Projet Laravel 13 frais (`composer create-project laravel/laravel`). Migrations + modèles Eloquent pour tout le schéma de `Readme.md`, testés via `php artisan tinker` sur SQLite local avant de passer à MySQL/Docker.

**Auth : toujours aucune (pas de Sanctum)**. `routes/api.php` existe maintenant (créé pour la page Paramètres, voir plus bas) mais **toutes les routes sont ouvertes**, commentaire explicite en tête de fichier renvoyant à `ERP/erp-api/routes/api.php` pour le modèle à suivre (auth:sanctum + split lecture/écriture par rôle) le jour où l'auth existera. Ne pas construire de nouvelle route en supposant un `$request->user()` disponible.

**Tables/modèles créés**, avec quelques corrections/interprétations par rapport au brouillon de `Readme.md` :
- `roles`, `role_user` (pivot `User`↔`Role`), `users` (`username` remplace le `name` par défaut de Laravel, `barcode` nullable unique — **pas encore de génération EAN-13 ni de login par badge**, contrairement à `ERP/` qui a cette feature complète ; à répliquer si voulu).
- `stations`, `passes` (**`passes.station_id`** — une passe appartient à une station, sens inverse de `ERP/` où c'est `stations.passe_id`. Choix délibéré du brouillon `Readme.md`, pas une erreur de copie).
- `payment_methods`, `taxes` (`slug`+`value`, pas de `name`).
- `product_categories`, `product_catalogs` (juste `name`+`slug`, pas de `tax_id` — déplacé sur `products` directement, voir ci-dessous), `products` (`tax_id` nullable, `station_id` **simple FK nullable**, pas many-to-many comme `ERP/` — à revoir si un produit doit un jour pouvoir sortir sur plusieurs postes).
- `clients`, `rooms`, `tables` (modèle **`TableElement`**, pas `Table` — collision de nom avec le concept générique de table SQL/PHP ; `$table = 'tables'` fixé explicitement dans le modèle).
- `orders` (+ `order_sections`, `order_lines`) : commande en cours en cuisine, distincte du `Ticket` payé — contrairement à `ERP/` qui n'a qu'un `SectionCall` éphémère jamais persisté comme entité de premier ordre.
  - **`orders.state`** : colonne `string`, défaut `send`, 5 valeurs confirmées par l'utilisateur (2026-07-27) : `send` (envoyée en cuisine) → `ask` (appelée/relancée) → `do` (en préparation) → `seed` (envoyée en salle, pas un typo malgré la ressemblance avec "send") → `done` (servie). Pas d'enum en base, juste une convention applicative pour l'instant.
- `tickets` (+ `ticket_sections`, `ticket_lines`, `ticket_payments`) : le reçu payé, une fois la commande soldée. `ticket_lines` n'a **pas** de snapshot de prix unitaire (`unit_price`) contrairement à `ERP/TicketLine` — potentiel problème si le prix d'un `Product` change après coup, un ticket déjà payé recalculerait un total différent du prix payé réellement. Pas ajouté car absent du brouillon `Readme.md`, mais à considérer avant de construire le paiement.
- Corrections de typos du brouillon : `Order_section.ticket_id` → `order_id` ; `Ticket_line.ticket_section` → `ticket_section_id`.
- Convention slug : trait partagé `App\Models\Concerns\HasSlug` (auto-génère `slug` depuis `name` à la création) sur tous les modèles qui ont les deux champs — évite de dupliquer le même `booted()` sept fois.

**Piège rencontré** : le `DatabaseSeeder` par défaut de Laravel 13 appelle `User::factory()->create(['name' => ...])` via `fake()` (Faker) — plante en Docker (`Call to undefined function fake()`) car l'image est buildée avec `composer install --no-dev`, qui exclut `fakerphp/faker`. `DatabaseSeeder` a depuis été rempli avec de vrais seeders (voir section dédiée plus bas), qui n'appellent jamais `User::factory()`. `UserFactory` corrigé pour utiliser `username` (plus `name`) si un jour rappelé en dev local (toujours pas utilisé par aucun seeder réel).

**Le `Readme.md` a été édité en direct par l'utilisateur pendant ce scaffolding** (`state` : `Validate` → `Seedn` → `Send` ; `taxe_id` déplacé de `Product_Catalogs` vers `Product`) — migrations/modèles resynchronisés sur la version finale à chaque fois. Si une future session repart de `Readme.md`, vérifier qu'il n'a pas encore bougé depuis.

### Page Paramètres (2026-07-27)

Demandée par l'utilisateur avec 4 sections précises (extrait de `Readme.md`, section "Page/Params") : tables & salles (position, ajout de salle), catégories de produits, catalogues de produits (activation), utilisateurs et rôles. Construite en s'inspirant directement de l'implémentation déjà existante et fonctionnelle dans `ERP/erp-app/src/app/pages/parametres/` (même structure de pages, mêmes services) plutôt que d'être réinventée — voir cette référence en cas de doute sur un pattern.

- **Controllers** (`app/Http/Controllers/Api/`) : `ProductCategoryController`, `ProductCatalogController` (+ `activate()` — un seul catalogue actif à la fois, transaction qui désactive tous les autres, `active` volontairement absent du `#[Fillable]` du modèle donc `forceFill()` requis), `RoleController` (**CRUD complet, contrairement à `ERP/` où les rôles sont lecture-seule** — demandé explicitement ici : "gérer les utilisateurs ET les différents rôles"), `UserController` (sync `role_ids` via `roles()->sync()`, mot de passe optionnel à l'édition), `RoomController`, `TableElementController` (imbriqué "shallow" comme `RoomElementController` dans `ERP/` : `POST /rooms/{room}/tables` mais `PUT/DELETE /tables/{table}`).
- **`routes/api.php`** créé (n'existait pas dans le skeleton Laravel 13 par défaut) et enregistré dans `bootstrap/app.php` (`api: __DIR__.'/../routes/api.php'`).
- **Bug corrigé en cours de route** : `product_catalogs.active` avait été migré avec un défaut `true` — cassait l'invariant "un seul actif à la fois" dès qu'un deuxième catalogue était créé (aucun des deux n'affichait alors le bouton "Activer", tous les deux déjà actifs). Corrigé en `default(false)`, comme `ERP/erp-api/.../create_catalogs_table.php` (`is_active` par défaut `false`).
- **Frontend** (`erp-app/src/app/`) :
  - `core/resource.service.ts` + `cached-resource.service.ts` : copie quasi-identique du pattern `ERP/erp-app/src/app/core/` (CRUD générique + cache mémoire via `shareReplay`, invalidé après chaque écriture) — cf. [[feedback-erp-caching]].
  - `core/table-element.service.ts` : **pas** un `CachedResourceService` (comme `RoomElementService` dans `ERP/`) — création imbriquée sous une room, lecture/update/delete shallow, ne rentre pas dans la forme mono-endpoint du service générique.
  - `layout/shell/shell.ts` : la sidebar (posée dans `app.html` lors du travail précédent sur `styles.css`) déplacée ici comme layout persistant Angular Router (route racine avec `children`), le contenu du dashboard déplacé dans `pages/dashboard/`. `app.html` ne contient plus que `<router-outlet />`.
  - `pages/parametres/` : `parametres-home` (hub à tuiles) + une paire liste/formulaire routée par section (`categories`, `catalogs`, `roles`, `users`, `rooms`), même convention que `ERP/` (routes `nouveau`/`:id` réutilisant le même composant formulaire, pas de modale).
  - `pages/parametres/rooms/floor-plan-editor/` : éditeur de plan de salle en Pointer Events natifs (pas de librairie drag&drop), copié de `ERP/erp-app/.../floor-plan-editor.ts` puis **simplifié à un seul type d'élément** (`table`, cercle) — pas de murs/mobilier/plantes/texte comme dans `ERP/`, non demandé ici. Grille d'accroche 20px, resize via poignée dédiée, position/taille persistées au `pointerup` (`PUT /api/tables/{id}`), mise à jour locale optimiste pendant le drag.
  - Petites classes ajoutées à `styles.css` pour ces pages (`.back-link`, `.hub-grid`/`.hub-card`, `.form`/`.form-section`/`.form-actions`, `.error-text`, `.checkbox-group`/`.checkbox-field`) — cohérentes avec les tokens déjà en place, pas de nouvelle palette.

**Vérifié de bout en bout en Chromium headless (Playwright)** : création/édition/suppression sur les 5 ressources, activation de catalogue (bascule correcte, un seul actif), assignation de rôle à un utilisateur, ajout de 2 tables sur le plan, drag + resize d'une table, **rechargement complet de la page → position/taille toujours correctes** (confirme la persistance côté API). Aucune erreur console.

**Piège de test (pas un bug applicatif)** : dans le script Playwright, remplir le champ juste après une navigation SPA vers `.../nouveau` échouait parfois silencieusement (payload envoyé avec `name: ""`) si le `fill()` arrivait immédiatement après `waitForURL` — a nécessité un `waitForSelector(..., {state:'visible'})` avant chaque `fill()` (composant lazy-loadé pas encore rendu au moment où l'URL change). N'affecte pas un utilisateur réel (qui ne tape jamais aussi vite qu'un script), mais à savoir pour écrire d'autres tests E2E sur ce projet.

### Frontend (`erp-app`) — état d'ensemble
`ng new` frais (Angular 21, CSS, routing, sans SSR). Toujours aucune auth (pas de login, pas de guard — cohérent avec l'absence de Sanctum côté API). Ce qui existe :
- **`src/styles.css`** : design system global inspiré des maquettes `notion/` (dashboards "bitepoint"/"Tasty Station") — tokens CSS clair/sombre (`prefers-color-scheme` + `[data-theme]` pour bascule manuelle future), sidebar teal foncé constante dans les deux thèmes, accent doré pour les CTA, badges de statut pastel (succès/attention/info/danger), composants boutons/cartes/tableau/onglets/modale. **Piège corrigé** : un fond plein + texte blanc (`.btn-primary`, `.stat-card--brand`, `.tab-pill.is-active`) réutilisait au départ la même variable que le texte/lien accent, qui s'éclaircit exprès en mode sombre — devenait illisible (blanc sur teal clair). Séparé en un token dédié `--color-primary-fill` qui reste toujours foncé, indépendant du thème.
- **`layout/shell/`** : sidebar + `<router-outlet>` en layout persistant (route racine à `children`), remplace le placeholder qui vivait directement dans `app.html`. Depuis 2026-07-28 (demande utilisateur via `Readme.md`) : icônes sur chaque item de nav, bouton « Réduire » qui passe la sidebar en mode icônes seules (`.app-sidebar.is-collapsed`, largeur 260px→76px, labels masqués en CSS via `.app-nav-item__label`), bascule thème clair/sombre en bas de sidebar (pose `document.documentElement.dataset.theme`, exploite le `[data-theme]` déjà prévu dans `styles.css`), bloc utilisateur en bas (**maquette statique** — `{ name: 'Thomas', role: 'Administrateur' }` en dur dans `Shell`, pas de vraie donnée tant qu'il n'y a pas d'auth). Les deux préférences (réduit/thème) sont persistées dans `localStorage` (`erp-v2-sidebar-collapsed`, `erp-v2-theme`) et réappliquées au chargement — vérifié après reload complet en Chromium headless.
- **`pages/dashboard/`** : la démo de composants du travail précédent sur `styles.css`, conservée comme page d'accueil (décision utilisateur 2026-07-27) — toujours des données statiques, pas branchée sur l'API.
- **`pages/parametres/`** : voir section dédiée ci-dessus (catégories, catalogues, rôles, utilisateurs, salles/plan de table) — première partie du frontend réellement branchée sur l'API.

Vérifié en Chromium headless (Playwright) contre le conteneur Docker déjà lancé — aucune erreur console.

### Infra
`docker-compose.yml` calqué sur celui de `ERP/` (mêmes conventions : `.env` racine unique injecté via `env_file`, `environment:` du service `api` pour le câblage fixe DB/cache/session). Pas de Reverb/websocket pour l'instant (pas de besoin identifié, contrairement à `ERP/` qui l'a ajouté pour l'écran cuisine temps réel — à réintroduire si un écran cuisine est construit). **`docker compose up --build` vérifié fonctionnel** (2026-07-27) : les 4 services démarrent, migrations MySQL appliquées via l'entrypoint, API et front répondent en HTTP 200.

## Hypothèses restant à trancher
- Absence de prix snapshot sur `ticket_lines` (risque identifié, pas résolu) — à corriger avant de construire le paiement des tickets.
- `products.station_id` en FK simple (pas multi-postes) — accepté tel quel ou à corriger avant que le catalogue produit existe réellement ?
- Pas de kitchen-display/Reverb pour l'instant — à ajouter seulement si un écran cuisine séparé est voulu.
- Aucune auth (Sanctum) — la page Utilisateurs/Rôles gère déjà des comptes et mots de passe côté données, mais rien ne protège encore les routes ni ne connecte personne. Prochaine session logique.
- Le plan de salle ne gère qu'un seul type d'élément (`table`) — pas de murs/mobilier comme `ERP/`, à réévaluer si le plan doit un jour représenter la salle visuellement, pas juste positionner les tables.

### Page Produits + référentiels Stations/Taxes (2026-07-28)

Demandé par l'utilisateur ("Ajouter la gestion des produits crud", `Readme.md` section Page) — page dédiée `/produits` (top-level, liée à l'item "Produits" déjà présent dans la sidebar), distincte de `/parametres`.

- **Backend** : `ProductController` (CRUD standard, FK simples `tax_id`/`station_id`/`product_category_id`/`product_catalog_id`, pas de many-to-many contrairement à `ERP/ProductController` — cohérent avec le modèle `Product` déjà scaffoldé). `index()`/`show()` eager-chargent `station`, `category`, `catalog`, `tax` pour que le frontend affiche les noms sans requêtes séparées.
- **Ajout nécessaire pour que le formulaire produit soit utilisable** : `StationController` et `TaxController` (CRUD complets, n'existaient pas encore — seuls les modèles avaient été scaffoldés à la toute première session). Sans eux, `station_id`/`tax_id` sur `Product` n'auraient jamais eu de valeurs possibles à choisir dans un `<select>`. `Tax` n'a pas de `name` (juste `slug`+`value`, voir `Readme.md`) donc pas de trait `HasSlug` — le slug est saisi à la main dans `TaxController`/`tax-form`.
- **Frontend** : `pages/products/` (liste + formulaire, même convention routée que les autres pages CRUD) avec 4 `<select>` (catégorie/catalogue/station/taxe) alimentés par les services correspondants. **Piège Angular** : les `<option>` utilisent `[ngValue]` (pas `[value]`) pour préserver le type `number` des id à travers le binding `[ngModel]` — `[value]` les aurait sérialisés en chaîne, cassant la correspondance avec les signals `number | null`. `pages/parametres/stations/` et `pages/parametres/taxes/` ajoutées au hub Paramètres (mêmes patterns liste/formulaire que les autres sections).
- **Piège d'infra rencontré** : après création de `tax-form.ts`/`tax-form.html`, le serveur de dev Angular dans Docker (`ng serve --poll`) est resté bloqué sur une erreur `NG2008: Could not find template file` alors que les deux fichiers existaient bel et bien (vérifié dans le conteneur) — cache de build figé sur un état transitoire (le `.ts` détecté avant que le `.html` soit flush sur disque). Un `docker compose restart app` suffit à débloquer ; pas un bug de code.

### Seeders (2026-07-28)

Demandé par l'utilisateur ("Ajouter des seeder de base et un DemoSeeder") — `database/seeders/`, calqué sur `ERP/erp-api/database/seeders/` mais adapté partout où le schéma diffère.

- **Seeders de base** (toujours exécutés, `DatabaseSeeder@run`) : `RoleSeeder` (`admin`/`superviseur`/`user`, mêmes slugs que `ERP/erp-api/database/seeders/RoleSeeder.php`), `AdminUserSeeder` (`ADMIN_USERNAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` depuis `.env`, rôle admin attaché), `StationSeeder`, `PasseSeeder`, `TaxSeeder`, `ProductCategorySeeder`, `ProductCatalogSeeder`, `PaymentMethodSeeder`. Tous idempotents (`firstOrCreate`), vérifié en relançant `db:seed` deux fois de suite sans doublons.
- **Adaptations dues au schéma inversé** : `PasseSeeder` crée directement chaque `Passe` avec son `station_id` (Cuisine→Viande, Bar→Bar) — pas de `StationPasseSeeder` séparé comme dans `ERP/`, puisque `passes.station_id` est non-nullable ici (une passe *appartient* à une station, contrairement à `ERP/` où plusieurs stations pointent vers un passe partagé). `TaxSeeder` seed `slug`+`value` (pas de `name`/`rate` comme `ERP/`). `ProductCatalogSeeder` active un catalogue via `forceFill()` (même contournement que `ProductCatalogController@activate`, `active` étant hors `#[Fillable]`).
- **`DemoSeeder`** (gated par `DEMO=true` dans `.env`, comme `ERP/`) : personnel (julie/superviseur, marc+sophie/user), 2 salles (Salle principale 6 tables, Terrasse 4 tables — que des `type: table`, pas de murs puisque l'éditeur de plan ne gère que ça), 5 clients, 19 produits répartis sur les 7 catégories. **Mise à jour 2026-07-28** : l'assignation catalogue se fait maintenant via `$product->catalogs()->syncWithoutDetaching([$catalog->id])` (many-to-many, voir section dédiée plus bas), plus via une FK directe comme décrit ici à l'origine.
- **Volontairement absent, contrairement à `ERP/DemoSeeder`** : aucune commande/ticket de démo. `ticket_lines` n'a toujours pas de snapshot de prix (question ouverte plus haut) et aucun controller/page Order/Ticket n'existe encore — des tickets de démo seraient invisibles dans l'app et figeraient une décision de modèle pas encore prise. À ajouter une fois cette question tranchée et l'écran caisse construit.
- **`.env`/`.env.example`** : ajout de `ADMIN_USERNAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD`/`DEMO` (mêmes noms que `ERP/`). `.env` local a `DEMO=true` (pratique pour développer avec des données) ; `.env.example` reste à `false` (défaut sûr pour un clone frais).
- Vérifié en Docker : `migrate:fresh --seed` avec `DEMO=true` (tout se peuple) et avec `DEMO=false` (seuls les référentiels de base, `DemoSeeder` correctement sauté) — les deux chemins fonctionnent sans erreur.
- **Vérifié en Chromium headless** (avant le passage en many-to-many ci-dessous, voir section dédiée) : CRUD stations/taxes, création d'un produit avec les 4 relations liées, page d'édition rechargeant correctement les 4 `<select>` sur les bonnes valeurs.

### Product ↔ ProductCatalog passé en many-to-many (2026-07-28, vérifié)

Demandé explicitement ("un produit peut avoir plusieurs catalogues et un catalogue peut avoir plusieurs produits"), fait sans tester sur le moment (consigne explicite), puis vérifié dans une session suivante (voir section "Bug post-changements non testés" plus bas pour ce qui a dû être corrigé pour que ça marche réellement) :

- **Migration** : `product_catalog_id` retiré de `create_products_table.php` (édité directement, pas de migration séparée — la table n'avait pas encore de données de prod). Nouvelle migration `2026_07_27_224011_create_catalog_product_table.php` crée la table pivot **`catalog_product`** (nom explicite, hors convention Laravel `product_product_catalog` qu'aurait donné l'ordre alphabétique des deux modèles) : `product_catalog_id` + `product_id`, unique sur la paire.
- **Modèles** : `Product::catalogs()` (`belongsToMany(ProductCatalog::class, 'catalog_product')`) remplace `Product::catalog()` ; `product_catalog_id` retiré du `#[Fillable]` de `Product`. `ProductCatalog::products()` passe de `hasMany` à `belongsToMany(Product::class, 'catalog_product')`.
- **`ProductController`** : `WITH` charge `catalogs` (pluriel) au lieu de `catalog`. `store`/`update` acceptent `catalog_ids` (array), l'extraient du payload validé puis appellent `$product->catalogs()->sync($catalogIds)` après la création/mise à jour — même pattern que `role_ids` sur `UserController`.
- **`DemoSeeder`** : chaque produit de démo est maintenant rattaché à son catalogue via `$product->catalogs()->syncWithoutDetaching([$catalog->id])` plutôt qu'un champ `product_catalog_id` direct à la création.
- **Frontend** : `Product.catalog_id`/`catalog` remplacés par `catalog_ids?: number[]` (write-only) et `catalogs?: ProductCatalog[]` (lecture) dans le modèle TS. `product-form` : le `<select>` catalogue unique devient un groupe de cases à cocher (`isCatalogChecked`/`toggleCatalog`, même pattern que les rôles sur `user-form`). `product-list` : nouvelle méthode `catalogNames(product)` (jointure des noms) affichée dans la colonne "Catalogues" (pluriel) au lieu d'un seul nom.
- **`ProductCatalogController@activate`** : indépendant de la relation many-to-many à l'origine, mais **remplacé juste après dans la même session** par deux méthodes distinctes — voir section suivante.

### Formulaires pleine largeur + double sélection de catalogue actif (2026-07-28, vérifié)

Deux demandes de l'utilisateur dans le même message, faites sans tester sur le moment :

- **Formulaires pleine largeur** : `.form` dans `styles.css` avait `max-width: 480px` — retiré (`width: 100%` à la place). Concerne tous les formulaires CRUD (`category-form`, `catalog-form`, `role-form`, `user-form`, `room-form`, `station-form`, `tax-form`, `product-form`), aucun n'a de largeur propre, ils héritent tous de `.form`.
- **Double sélection de catalogue actif** : la sidebar distingue maintenant deux POS (`POS - Restaurant` et `POS - Vente directe`, édités en direct par l'utilisateur dans `layout/shell/shell.ts` — voir plus haut). Un seul catalogue "actif" global n'a plus de sens : chaque POS doit pouvoir afficher un catalogue différent. `ProductCatalog.active` (un seul booléen) devient **deux** booléens indépendants :
  - Migration `create_product_catalogs_table.php` (éditée directement, toujours pas de données de prod) : `active` → `active_restaurant` + `active_direct_sale`, tous deux `default(false)`.
  - `ProductCatalogController::activate()` → deux méthodes `activateForRestaurant()`/`activateForDirectSale()`, même logique de transaction (désactive tous les autres **sur la même colonne seulement** puis active celui-ci) mais totalement indépendantes l'une de l'autre — un catalogue peut être actif pour les deux POS à la fois, pour un seul, ou aucun.
  - Routes : `POST /product-catalogs/{id}/activate-restaurant` et `.../activate-direct-sale` remplacent l'ancienne route unique `/activate`.
  - `ProductCatalogSeeder` : le catalogue de base est maintenant forcé actif sur les **deux** contextes séparément (deux `forceFill()` distincts).
  - Frontend : `ProductCatalog.active` → `active_restaurant`/`active_direct_sale` dans le modèle TS ; `ProductCatalogService.activate()` → `activateForRestaurant()`/`activateForDirectSale()` ; `catalog-list` a maintenant deux colonnes de statut/bouton ("POS Restaurant" / "POS Vente directe") au lieu d'une seule colonne "Statut".
- **Pas encore fait, à réévaluer plus tard** : rien ne lit encore `active_restaurant`/`active_direct_sale` côté "affichage produit dans un POS" — les pages `/pos-restaurant`/`/pos-vente-directe` elles-mêmes n'existent pas encore (seuls les liens de sidebar existent). Cette double activation prépare le terrain mais n'est consommée par aucun écran de vente pour l'instant.
- **Vérifié en Chromium headless** (2026-07-28, session suivante) : les deux boutons "Activer" (Restaurant/Vente directe) fonctionnent indépendamment, testé en cliquant réellement dessus puis en rechargeant la page — l'état persiste bien côté API. La colonne "Catalogues" (pluriel) s'affiche correctement dans `/produits` avec les noms joints.

### Bug post-changements non testés, corrigé (2026-07-28)

L'utilisateur a signalé "les boutons Activer ne marchent pas" et "affiche les catalogues dans la liste produit" — pas des bugs de code, mais une conséquence directe des deux sessions précédentes faites volontairement **sans tester** : le conteneur Docker `erp_v2_api` tournait encore sur l'ancienne image (avant many-to-many, avant double activation), et la base de données avait encore l'ancien schéma (`active` au lieu de `active_restaurant`/`active_direct_sale`, pas de table `catalog_product`).

- **Piège découvert en corrigeant** : `docker/entrypoint.sh` exécute toujours `php artisan migrate --force` (pas `migrate:fresh`) puis `db:seed --force` avant de lancer Apache. Comme les migrations avaient été **éditées en place** plutôt qu'ajoutées en nouveaux fichiers (convention adoptée dès le début de ce projet tant qu'aucune donnée de prod n'existe), Laravel ne les rejoue pas — `migrate` seul dit "Nothing to migrate" même quand le contenu d'un fichier déjà appliqué a changé. Résultat : après `docker compose up --build`, le conteneur redémarrait en boucle (`Restarting`), le seeder échouant sur `Unknown column 'active_restaurant'`.
- **Fix appliqué** : `docker compose run --rm --entrypoint sh api -c "php artisan migrate:fresh --force"` pour forcer un schéma propre (bypass volontaire de l'entrypoint, qui sinon relance son `migrate` non-fresh avant d'atteindre la commande voulue), puis `db:seed --force` séparément. Une fois la base à jour, le conteneur principal `erp_v2_api` s'est stabilisé normalement.
- **À retenir pour la suite** : après toute session qui édite une migration **déjà appliquée** (au lieu d'en ajouter une nouvelle) sans rebuild/migrate immédiat, la prochaine session doit impérativement passer par `docker compose run --rm --entrypoint sh api -c "php artisan migrate:fresh --force"` (pas juste `docker compose up --build`) avant de tester quoi que ce soit — sinon le conteneur tourne avec un vieux code et/ou un vieux schéma et les symptômes ("bouton qui ne marche pas", "donnée qui ne s'affiche pas") n'ont rien à voir avec le code lui-même.

### POS Vente directe + Ticket/Client/PaymentMethod (2026-07-29)

Demandé par l'utilisateur ("le POS vente directe avec le bon catalogue de vente directe, inspire-toi du dossier notion" — "nossio" dans la demande initiale, coquille pour `notion/`, seul dossier de maquettes existant). Premier écran de vente réel du projet — jusqu'ici seuls `/produits` et `/parametres` existaient. Choix validés par l'utilisateur avant construction : paiement **multi-moyens** (split) et sélection client **optionnelle**, pas de flux Order/cuisine (vente directe = encaissement immédiat, cohérent avec la distinction déjà actée dans `Readme.md`).

- **Risque `ticket_lines` sans prix snapshot corrigé** (identifié comme bloquant "avant de construire le paiement", voir plus haut) : migration `create_ticket_lines_table.php` éditée en place pour ajouter `unit_price` (decimal 8,2). `TicketLine` mis à jour (`Fillable` + cast). Le prix est toujours recalculé depuis `Product::price` côté serveur au moment de la vente, jamais fait confiance au payload front.
- **Backend** :
  - `ClientController` (`index` avec recherche `?q=` sur prénom/nom/email/téléphone limitée à 20 résultats, `store` pour la création rapide "+ Nouveau client" depuis le POS) — pas de CRUD complet, pas de page `/clients` dédiée pour l'instant, juste ce qu'il faut au sélecteur.
  - `PaymentMethodController` (`index` seul, lecture seule — moyens de paiement seedés, pas de page de gestion).
  - `TicketController@store` : valide `client_id` (nullable), `lines[]` (`product_id`+`quantity`), `payments[]` (`payment_method_id`+`value`) ; recalcule le total serveur depuis les prix `Product` courants ; **rejette (422) si la somme des paiements ne correspond pas exactement au total** (`round(...,2)`, pas de tolérance de rendu de monnaie pour l'instant) ; crée `Ticket` (`paid_at = now()`) + une `TicketSection` unique ("Vente directe") + les `TicketLine` (avec `unit_price` snapshoté) + une `TicketPayment` par moyen de paiement, le tout dans une transaction.
  - Routes ajoutées (pas de `apiResource`, juste les verbes réellement implémentés) : `GET/POST /clients`, `GET /payment-methods`, `POST /tickets`.
- **Frontend** (`pages/pos-vente/`, route `/pos-vente`, déjà présente dans la sidebar depuis une session précédente) :
  - Layout deux colonnes façon maquette "Tasty Station — Order Line" du dossier `notion/` : grille produits filtrable (recherche + onglets catégorie en `tab-pill`) à gauche, panneau caisse sticky à droite (client, lignes de panier avec stepper qty, total + "dont TVA", moyens de paiement, validation).
  - **Catalogue** : ne montre que les produits `active` rattachés au `ProductCatalog` où `active_direct_sale = true` (celui actif spécifiquement pour ce POS, indépendant du POS Restaurant — voir la double activation ajoutée le 2026-07-28). Message explicite si aucun catalogue n'est actif pour ce contexte.
  - **TVA affichée** : prix produit supposé TTC, la ligne "dont TVA" est extraite du prix (`prix - prix / (1 + taux/100)`), pas ajoutée dessus — juste informatif, n'affecte pas le total payé.
  - **Paiement multi-moyens** : cliquer un moyen de paiement (pilule) ajoute une ligne pré-remplie avec le montant restant, modifiable ; "Valider la vente" désactivé tant que la somme des lignes de paiement ne tombe pas exactement sur le total (tolérance flottante `< 0.005`).
  - **Client optionnel** : champ recherche (debounce 250ms, `ClientService.search`) → liste de résultats cliquable, ou "+ Nouveau client" (mini-formulaire prénom/nom/téléphone inline, pas de modale — cohérent avec le reste de l'app qui n'utilise pas de modales pour les formulaires CRUD).
  - Vignettes produit : pas de champ image en base, emoji tournant par catégorie (`PRODUCT_EMOJIS`), cohérent avec les icônes emoji déjà utilisées partout ailleurs dans l'app (sidebar, hub Paramètres) plutôt que d'introduire un système d'assets.
  - Nouveaux modèles/services : `core/models/ticket.model.ts` (`Client`, `PaymentMethod`, `Ticket`, `TicketSection`, `TicketLine`, `TicketPayment`, `CreateTicketPayload`), `core/client.service.ts`, `core/payment-method.service.ts` (`CachedResourceService`), `core/ticket.service.ts`.
  - Classes CSS ajoutées à `styles.css` (`.pos-*`, `.qty-stepper`) — entièrement sur les tokens existants, aucune nouvelle couleur ; breakpoint `960px` qui repasse `.pos-layout` en une colonne (panier sous la grille) pour mobile/tablette.
- **`.env` local repassé à `DEMO=true`** (était à `false`, contrairement à la convention documentée plus haut "`.env` local a `DEMO=true`") pour pouvoir tester avec des données ; `migrate:fresh --seed` relancé en Docker (nécessaire de toute façon après l'édition de migration ci-dessus).
- **Vérifié en Chromium headless (Playwright)**, installé à la volée pour cette session (pas présent dans l'environnement) : ajout produits au panier (quantités, stepper +/-), recherche + sélection client existant, création rapide de client, ajout d'un moyen de paiement, **split de paiement sur deux moyens** (Espèces + Carte bancaire) jusqu'à somme exacte, bouton "Valider" qui se débloque uniquement à ce moment, soumission → ticket créé côté API, message de succès affiché, panier vidé après coup. Thème sombre et viewport mobile (480px) vérifiés visuellement aussi — contraste correct, layout une colonne. Aucune erreur console sur l'ensemble du parcours.
- **Pas encore fait, à réévaluer plus tard** : pas d'impression/aperçu de ticket après la vente (juste un message de confirmation avec le numéro) ; pas de gestion du rendu de monnaie (le paiement doit tomber exactement sur le total) ; pas de page `/clients` dédiée (recherche + création rapide seulement, pas d'édition/suppression) ; le POS Restaurant (avec plan de salle et flux `Order`) n'est toujours pas construit.

**Mise à jour même jour** — deux ajustements demandés juste après (relecture directe du `Readme.md`, section Todo) :
- **Page fixe, sans scroll de page** : `Shell` (`layout/shell/`) détecte maintenant la route active (`Router.events` → `NavigationEnd`) et pose `.app-main--fixed` sur `<main>` pour les routes listées dans `FIXED_LAYOUT_ROUTES` (juste `/pos-vente` pour l'instant). Cette classe fixe `.app-main` à `height:100vh;overflow:hidden` ; `.pos-layout`/`.pos-products`/`.pos-grid`/`.pos-cart`/`.pos-cart__body` gèrent chacun leur propre `overflow-y:auto` interne (`min-height:0` partout où c'est nécessaire pour que le scroll interne se déclenche au lieu de pousser le parent). Générique et réutilisable : un futur POS Restaurant plein écran n'aurait qu'à s'ajouter à `FIXED_LAYOUT_ROUTES`. Sous 960px, on repasse à un scroll unique de `.pos-layout` (colonne empilée), plus simple qu'un double scroll interne sur mobile.
- **Modal de paiement** : le pavé paiement (moyens + lignes de split + "restant à payer") est sorti du panneau panier et déplacé dans une modal (`.modal-overlay`/`.modal-panel`, déjà présents dans `styles.css` depuis les tokens de base). Le bouton "Valider la vente" du panneau panier devient **"Payer — {total}"**, désactivé seulement si le panier est vide ; il ouvre la modal (`showPaymentModal`). La modal contient le vrai bouton de soumission (désactivé tant que `remaining() > 0`) + un bouton "Annuler" qui ferme la modal et **réinitialise les lignes de paiement** (`closePaymentModal()`) pour repartir propre à la prochaine ouverture — testé : annuler puis rouvrir affiche bien 0 ligne de paiement. Fermeture aussi au clic sur l'overlay (`(click)` sur `.modal-overlay` + `stopPropagation()` sur `.modal-panel`).
- **Vérifié en Chromium headless** : `document.body.scrollHeight === window.innerHeight` et un `wheel` sur la page ne bouge pas `window.scrollY` (page réellement fixe) ; ouverture modal, paiement complet → soumission → modal se ferme automatiquement + message de succès ; annulation → modal se ferme, panier intact, paiement réinitialisé.

**Deuxième mise à jour même jour** (relecture `Readme.md` à nouveau) — pas re-testé en navigateur cette fois (demande explicite de l'utilisateur), seule la compilation Angular a été vérifiée (`docker logs erp_v2_app`, aucune erreur) :
- **`/produits` : tri + filtre catalogue**, entièrement client-side (la liste est déjà chargée en mémoire via `CachedResourceService`, pas de nouveaux paramètres d'API) — `product-list.ts` calcule `filteredProducts` (computed) à partir de `catalogFilterId` (select au-dessus du tableau) et `sortField`/`sortDir` (colonnes "Nom"/"Prix" cliquables, classe `.is-sortable`, indicateur ▲/▼).
- **Clavier visuel de paiement** dans la modal (remplace l'ancien flux "clic sur la pastille = ajoute instantanément le montant restant" + `<input type="number">` éditable) : cliquer un moyen de paiement affiche un clavier (`enteringMethod`/`keypadBuffer`) — pavé numérique 0-9/./⌫, boutons rapides (Montant dû, 5/10/20/50 €), bouton "Ajouter {montant}" qui pousse la ligne dans `paymentLines` et revient à la liste des moyens. Les lignes déjà ajoutées ne sont plus éditables inline (juste un ✕ pour retirer et resaisir).
- **Bug corrigé : hover et badge de quantité rognés sur les cartes produit** — cause racine : `.pos-grid` avait reçu `overflow-y:auto` lors du passage en layout fixe (section précédente), ce qui clippe tout ce qui déborde visuellement d'une carte (le badge à `top:-8px;right:-8px`, l'ombre + `translateY(-2px)` du hover) pour les cartes proches des bords du conteneur scrollable. Fix : `padding: var(--space-4)` ajouté sur `.pos-grid` pour donner de la marge au contenu qui déborde avant d'atteindre le bord du scrollport — pas de solution "propre" alternative simple (le clipping sur overflow non-`visible` est un comportement CSS standard, pas un bug de bordure).

### `/produits` : filtre catégorie + tri sur tous les champs (2026-07-29)

Ajouté au filtre catalogue déjà existant — toujours 100% client-side (`product-list.ts`), aucun changement backend. `SortField` étendu à `name | category | catalogs | station | price | active`, une méthode `compare()` privée centralise le comparateur par champ (chaîne via `localeCompare`, nombre pour le prix, booléen→nombre pour le statut). Les deux filtres (catalogue + catégorie) se combinent en ET. Les 6 colonnes du tableau sont maintenant cliquables (`.is-sortable`) avec indicateur ▲/▼.

### POS Vente directe : clavier réservé à Espèces + rendu (2026-07-29)

Suite à la demande "le clavier ne doit s'afficher que pour espèces et afficher le rendu" : `selectPaymentMethod()` distingue maintenant `isCash(method)` (teste `method.slug === 'especes'`, slug seedé par `PaymentMethodSeeder`). Pour les moyens non-cash (Carte bancaire, Bancontact, Chèque-repas), un clic ajoute directement une ligne de paiement pour le montant dû (pas de clavier — on ne split/rend pas la monnaie sur ces moyens). Pour Espèces uniquement, le clavier visuel s'affiche ; `changeDue` (computed) calcule le rendu si le montant tapé dépasse le restant dû, affiché dans un bandeau dédié. Le montant réellement poussé dans `paymentLines` reste plafonné au restant dû (`appliedAmount`, `Math.min(typed, remaining)`) — le surplus n'est qu'un rendu affiché, jamais compté dans le paiement (le backend continue d'exiger une somme exacte).

### Section Événements (2026-07-29, pas testée en navigateur — demande explicite de l'utilisateur, seule la compilation a été vérifiée)

Nouvelle section top-level demandée via `Readme.md`, indépendante du POS/Order — vente de "places" pour un événement, avec code de validation, check-in, et placement en salle optionnel.

**Backend** :
- Migrations `events` (`name`, `slug`, `date`, `start_hour` en colonne `time`, `room_id` nullable → `rooms`, `number_place_limit` nullable) et `event_tickets` (`event_id` cascade, `client_id` **requis** restrict, `table_id` nullable → `tables`, `validation_code` unique, `validated_at` nullable). Nouveaux fichiers de migration (pas d'édition en place cette fois, contrairement aux sessions précédentes — ces tables n'existaient pas encore, pas de raison de casser la convention "migrate --force suffit").
- Modèles `Event` (trait `HasSlug`, `casts(): ['date' => 'date']`, `start_hour` laissé en string brute — pas de cast time natif simple côté Eloquent) et `EventTicket` (`casts(): ['validated_at' => 'datetime']`).
- `EventController` : CRUD standard, `index`/`show` eager-chargent `room.tables` (nécessaire pour la page de check-in).
- `EventTicketController` :
  - `index` **toujours filtré par `event_id`** (query param requis) — pas de vue globale toutes places confondues, cohérent avec le fait que chaque page consommatrice est déjà scopée à un événement.
  - `store` : vérifie `number_place_limit` (422 "Cet événement est complet." si atteint), génère un code unique (`Str::upper(Str::random(8))`, boucle jusqu'à unicité), envoie un email si `send_email=true` **via `Mail::raw()` direct dans le controller** (pas de classe Mailable — overkill pour un simple message texte) ; `MAIL_MAILER=log` déjà configuré donc rien à installer pour tester, le mail atterrit dans `storage/logs/laravel.log`.
  - `update` ne permet de changer **que** `client_id` — l'événement et le code restent fixes une fois la place vendue.
  - `validateCode` (`POST /event-tickets/validate`, pas une route resource) : trouve le ticket par code (422 si inconnu ou déjà validé), si `table_id` fourni vérifie qu'elle appartient à la salle de l'événement (422 sinon) et qu'elle n'est pas déjà prise par un autre ticket validé du même événement (422 sinon), puis `forceFill(['validated_at' => now(), 'table_id' => ...])`. `table_id` est ignoré silencieusement si l'événement n'a pas de `room_id`.
- Routes explicites (pas `apiResource` pour `event-tickets`, seulement les verbes réellement implémentés) : `apiResource('events', ...)` + `GET/POST event-tickets`, `POST event-tickets/validate`, `PUT/DELETE event-tickets/{event_ticket}`.
- **Vérifié via `curl`** (pas de navigateur) : vente de place, limite de places (2ᵉ vente rejetée), validation par code, double-validation rejetée (422), email loggé dans `laravel.log`, placement strict (table assignée), table d'une autre salle rejetée, table déjà prise rejetée.

**Frontend** (`pages/events/`, route racine `/evenements`, nouvel item sidebar 🎫) :
- `core/models/event.model.ts`, `core/event.service.ts` (`CachedResourceService<Event>`), `core/event-ticket.service.ts` (pas un `ResourceService` — `index` toujours filtré par événement, pas de `get(id)` unitaire côté API, plus l'action `validate` qui n'a pas d'équivalent générique).
- `event-list` / `event-form` : CRUD standard événement (nom, date, heure, salle optionnelle, limite optionnelle), même convention liste/formulaire routé que les autres pages.
- `event-tickets` (`/evenements/:id/places`, couvre les points 1 et 2 du `Readme.md`) : panneau "Vendre une place" avec le même sélecteur client (recherche + création rapide) que le POS Vente directe — **classes CSS `.pos-client__*` réutilisées telles quelles** (générique malgré le préfixe `pos-`, évite de dupliquer ~30 lignes de CSS pour un pattern recherche+dropdown identique) — case "Envoyer par email", puis tableau des places vendues (client/code/statut/place/actions). "Modifier" **réutilise le même panneau** (bascule en mode édition via `editingTicketId`, ne permet de changer que le client) plutôt que dupliquer le sélecteur dans chaque ligne du tableau.
- `event-checkin` (`/evenements/:id/salle`, couvre les points 3 et 4) : un seul champ code + bouton "Valider la présence" ; si l'événement a une salle, un plan (CSS propre au composant `event-checkin.css`, inspiré de `floor-plan-editor.css` mais **lecture seule** avec 3 états visuels : libre/teal, sélectionnée/dorée, prise/rouge avec tooltip du nom client) permet de cliquer une place libre avant de valider — `code` + `table_id` partent **ensemble** dans un seul appel à `validateCode`, pas de pré-lookup séparé. Sert aussi d'affichage "places prises" en continu (point 4), pas de page séparée — la coloration taken/free est déjà l'information demandée, une page dédiée aurait été redondante.
- **Pas encore fait, à réévaluer plus tard** : pas de renvoi d'email après coup (seulement à la création) ; pas de recherche/pagination sur la liste des places si un événement en vend beaucoup ; le plan de salle du check-in ne montre pas de légende du nombre de places restantes ; aucune donnée de démo pour Événements dans `DemoSeeder` (non demandé).

### Événements : dashboard unifié + vente multiple (2026-07-29, pas testée en navigateur — demande explicite)

Deux demandes dans le même message : fusionner vente/liste/validation/placement en un seul dashboard par événement (au lieu des trois pages séparées de la session précédente), et permettre de vendre plusieurs places d'un coup.

- **Backend** : `EventTicketController@store` accepte maintenant `quantity` (défaut 1, max 50) — vérifie `sold + quantity <= number_place_limit` (message "il ne reste que N place(s)") plutôt que de rejeter/accepter tout-ou-rien, crée `quantity` `EventTicket` (un code chacun) et **répond toujours un tableau**, même pour `quantity=1`, pour garder un seul contrat côté frontend. `sendCodeByEmail` → `sendCodesByEmail` : un seul email groupé listant tous les codes plutôt qu'un email par place.
- **Frontend** : les trois pages `event-tickets`/`event-checkin` de la session précédente sont **supprimées** (dead code une fois le dashboard en place, pas juste dé-routées) — leur logique est fusionnée dans `pages/events/event-dashboard/` (un seul composant, `.ts`/`.html`/`.css`) : panneau vente (client + **champ "Nombre de places"** + email) avec confirmation listant tous les codes générés, panneau validation (code + plan de salle cliquable, identique à l'ancien `event-checkin`), tableau des places vendues avec modifier/supprimer — le tout empilé sur un seul écran (`.dashboard-grid` deux colonnes ≥960px, une colonne en dessous).
- **Routes réorganisées** : `/evenements/:id` devient le dashboard (était le formulaire d'édition) ; le formulaire d'édition déménage à `/evenements/:id/modifier`. `event-list.html` mis à jour (bouton "Dashboard" + "Modifier", les anciens boutons "Places"/"Validation" retirés).
- **Vérifié via `curl`** (pas de navigateur, demande explicite) : vente de 3 places d'un coup (3 codes distincts), email groupé bien loggé ("Voici 3 codes de validation..."), rejet propre quand `quantity` dépasse les places restantes.

### Emails avec QR codes + scan caméra pour la validation (2026-07-29, pas testée en navigateur)

Deux demandes : les emails de vente doivent inclure un QR code (pas juste le code texte), et la page de validation doit pouvoir scanner ce QR à la caméra plutôt que taper le code à la main.

- **SMTP réel configuré entre-temps** (demande séparée du même jour) : `.env` `MAIL_MAILER=smtp` vers `smtp.gmail.com:587` avec un compte Gmail + mot de passe d'application (`.env` non suivi par git, vérifié). Testé avec un vrai envoi via `Mail::raw()` en tinker — aucune exception, donc auth SMTP OK. Tous les emails Événements partent maintenant réellement (avant : juste loggés).
- **QR codes** : `composer require endroid/qr-code` (+ dépendance `bacon/bacon-qr-code`). Nécessite l'extension **GD**, absente de l'image de base — `Dockerfile` (`erp-api`) modifié : `libpng-dev` + `docker-php-ext-install gd`, image rebuildée (`docker compose build api`).
- **`App\Mail\EventTicketsMail`** (nouveau, remplace le `Mail::raw()` inline) : Mailable classique avec vue Blade (`resources/views/emails/event-tickets.blade.php`), un bloc par place vendue (QR + code texte lisible en dessous). Le QR encode **juste le code de validation en clair** (ex. `A1B2C3D4`), pas une URL — cohérent avec le scan côté check-in qui réinjecte directement la donnée décodée dans le champ code. QR généré en mémoire via `Endroid\QrCode\Builder\Builder` (API v6, syntaxe `build(writer: ..., data: ..., size: ..., margin: ...)`, pas de setters fluents comme les versions antérieures) puis exporté en **data URI base64** (`getDataUri()`) directement injecté dans le `<img src="...">` — pas de fichier temporaire sur disque, pas d'attachment MIME à gérer.
- **Volontairement pas `ShouldQueue`** sur le Mailable : aucun worker de queue n'est déployé pour ce projet (`QUEUE_CONNECTION=database` mais pas de `php artisan queue:work` dans `docker-compose.yml`) — un mail queué resterait bloqué en base indéfiniment. Envoi synchrone comme avant.
- **Scan QR caméra** (`event-dashboard.ts`) : `npm install jsqr` (décodeur QR pur JS, pas de dépendance native, types inclus). `startScan()` demande la caméra via `getUserMedia({video:{facingMode:'environment'}})`, attache le flux à un `<video>`, boucle `requestAnimationFrame` qui dessine chaque frame sur un `<canvas>` caché et lance `jsQR()` dessus ; dès qu'un QR est décodé, le code extrait remplit directement le champ `code` et déclenche `submitValidation()` (même chemin que la saisie manuelle — aucune différence de traitement côté validation). `ngOnDestroy()` coupe bien le flux caméra (`MediaStream.getTracks().forEach(t => t.stop())`) si on quitte la page en plein scan — nécessaire ici contrairement aux abonnements RxJS habituels du projet (laissés sans teardown ailleurs) car une caméra oubliée allumée est un vrai problème, pas juste une fuite mémoire bénigne.
- **Vérifié sans navigateur** : `php -m | grep gd` confirme l'extension active dans le conteneur rebuildé ; génération d'un QR en tinker → data URI PNG valide (`data:image/png;base64,iVBORw0KGgo...`, signature PNG correcte) ; vente de 2 places avec `send_email=true` vers une vraie adresse Gmail → 201 sans exception (email réellement transmis via SMTP, contenant les 2 QR + codes). Le scan caméra lui-même n'a pas pu être testé sans navigateur (nécessite une vraie caméra + interaction utilisateur pour l'autorisation `getUserMedia`).

### Sélecteur client avec email + impression PDF des QR + vue calendrier (2026-07-29, pas testée en navigateur)

Trois demandes dans le même message.

- **`Qr` helper partagé** (`App\Support\Qr::png($data, $size, $margin)`) extrait de `EventTicketsMail` pour être réutilisé par un nouvel endpoint `GET /event-tickets/{id}/qr` qui sert le PNG brut (`Content-Type: image/png`) — consommé directement en `<img src>` côté front, pas besoin de repasser par du JSON/base64.
- **Sélecteur client (dashboard événement)** : email affiché dans le chip du client sélectionné (nouvelle variante CSS `.pos-client__chip--stacked`, nom sur une ligne + email en dessous) et dans chaque résultat de recherche. `sendEmail` passe de `false` à `true` par défaut (et se réinitialise à `true` après chaque vente, pas juste une fois).
- **Impression / PDF des QR** : pas de lib de génération PDF ajoutée — `printTickets(tickets)` (dans `event-dashboard.ts`) ouvre un nouvel onglet avec une page HTML autonome (un bloc QR + code + client par place, `<img>` pointant vers le nouvel endpoint `/event-tickets/{id}/qr`), attend le chargement de toutes les images puis appelle `window.print()` — la boîte de dialogue d'impression du navigateur propose déjà nativement "Enregistrer en PDF" sur tous les OS, ce qui couvre "imprimer OU PDF" avec un seul mécanisme. Bouton disponible à trois endroits : dans la confirmation juste après une vente, par ligne dans le tableau des places (icône 🖨️ seule), et un bouton global "toutes les places" dans l'en-tête du tableau.
- **Vue calendrier** (`event-list.ts`) : toggle `tab-pill` Liste/Calendrier au-dessus du tableau existant (même signal `events`, pas de nouvel appel API). Grille mensuelle 7×6 classique (semaine commençant lundi), navigation mois précédent/suivant + "Aujourd'hui", jour courant surligné, un chip cliquable par événement du jour (heure + nom, `routerLink` vers son dashboard).
- **Bug corrigé au passage** : `formatDate()` dans `event-list.ts` faisait `event.date.split('-')` en supposant un format `YYYY-MM-DD`, alors que l'API renvoie un datetime ISO complet (`"2026-08-15T00:00:00.000000Z"`, cast Eloquent `date` sérialisé avec l'heure) — le "jour" affiché était en fait `"15T00:00:00.000000Z"`. Découvert en construisant le regroupement par jour du calendrier (qui aurait été silencieusement faux avec le même bug). Fixé avec une méthode `dateKey()` unique (`isoDate.slice(0, 10)`) utilisée à la fois par l'affichage liste et le calendrier.
- **Vérifié sans navigateur** : `curl /api/events` confirme le format `"2026-08-15T00:00:00.000000Z"` (donc le bug était réel et le fix légitime) ; `curl /api/event-tickets/{id}/qr` renvoie un PNG valide (`file` : `PNG image data, 260 x 260`).

## `erp_validate_event/` — app dédiée contrôle d'accès (2026-07-29, pas testée en navigateur)

Nouvelle app Angular, scaffoldée par l'utilisateur (`ng new erp_validate_event`, Angular 22 — plus récent que `erp-app` en 21.2, mais mêmes conventions standalone/zoneless/signals) puis construite dans cette session. Objectif : un kiosque dédié à l'entrée d'un événement, distinct de `erp-app` (qui reste l'outil de gestion back-office). Ne fait *que* lire des événements et valider des places — aucune écriture autre que la validation.

- **Style** : `src/styles.css` de `erp-app` copié tel quel (mêmes tokens, mêmes classes `.btn`/`.card`/`.badge`/`.checkin-table`/`.pos-keypad__key`/`.legend-dot` déjà construites pour le dashboard événement — réutilisées ici sans dupliquer le CSS). Le scaffold par défaut (`app.html`/`app.ts`, logo Angular, signal `title`) a été vidé.
- **Backend** : parle au même `erp-api` que `erp-app` (`API_URL` en dur vers `http://localhost:19001/api`, pas de proxy). `core/` minimal et **lecture seule** — `EventService` (`list`/`get`, pas de create/update/delete), `EventTicketService` (`listForEvent` pour colorer le plan de salle, `validate` pour l'action réelle) ; pas de `ClientService` (cette app n'a pas besoin de créer/chercher des clients).
- **`pages/event-select/`** (route `/`) : grille de tuiles tactiles, une par événement (nom, date, heure, salle si placement strict) — sélectionner navigue vers `/check-in/:id`.
- **`pages/event-checkin/`** (route `/check-in/:id`) : écran plein écran ("affiche la en grand").
  - **Deux modes** (`tab-pill` en haut) : **Scanner** (caméra + `jsQR`, même pattern que `pos-vente`/`event-dashboard` dans `erp-app`) et **Clavier** — un clavier virtuel AZERTY + chiffres (`.pos-keypad__key` réutilisé) *plus* un affichage du code qui accepte aussi bien la saisie tactile que la frappe d'un clavier physique/douchette USB en mode HID (cas réel fréquent en billetterie : la douchette "tape" le code comme un clavier). Les deux modes appellent le même `validate()` privé.
  - **Placement strict** : si `event.room_id` est renseigné, plan de salle affiché (mêmes classes `.checkin-canvas`/`.checkin-table` que `erp-app`), places prises en rouge (chargées via `listForEvent`), possibilité de cliquer une place libre *avant* de valider — le `table_id` sélectionné part avec le `code` dans le même appel à `/event-tickets/validate`, sélection non bloquante (comme côté `erp-app`, une place n'est pas obligatoire même si la salle existe).
  - **Animation plein écran** : overlay fixe (`.kiosk-flash`) vert (`kiosk-flash--success`) ou rouge (`kiosk-flash--error`) avec icône ✓/✕ animée (`kiosk-flash-pop`), nom du client + place assignée (ou message d'erreur), auto-masqué après 2,5s (`RESULT_DISPLAY_MS`) — pendant l'affichage du résultat, le scan/la validation suivante est bloquée (`resultState() !== 'idle'` court-circuite `validate()`) pour éviter un double-scan involontaire du même badge.
  - `ngOnDestroy` coupe la caméra si on quitte l'écran (même raison que `event-dashboard` : une caméra oubliée allumée est un vrai problème).
- **Docker** : `Dockerfile` + `docker-entrypoint.sh` copiés à l'identique de `erp-app` (image `node:22-alpine`, `npm install` si `node_modules` absent puis `ng serve --host 0.0.0.0 --poll`). Nouveau service `validate_event` dans `docker-compose.yml` (port `${VALIDATE_EVENT_PORT:-19003}`, volume nommé `validate_event_node_modules` séparé de celui de `erp-app`) + `.env`/`.env.example` mis à jour.
- **Piège rencontré** : `npm install jsqr` en local (hôte, hors Docker) a échoué avec une erreur `ERESOLVE` bizarre (`Found: @angular/common@undefined`) sur le cache npm global de la machine — même symptôme que le souci de cache root-owned rencontré plus tôt dans la session sur un autre projet. Contourné avec un `--cache <dossier temporaire>` dédié plutôt que d'investiguer le cache global (hors scope). Rappel : toute dépendance npm ajoutée à cette app doit être installée **à la fois** sur l'hôte (pour l'IDE/intellisense) et laissée à `docker-entrypoint.sh` le soin de la (ré)installer dans le volume du conteneur au démarrage — même piège que `jsqr` sur `erp-app` plus tôt.
- **Vérifié sans navigateur** : `docker compose build validate_event` + `up -d` → conteneur démarre, `npm install` s'exécute (458 paquets), `ng serve` compile sans erreur (`event-checkin` 35 kB, `event-select` 10 kB). `curl http://localhost:19003/` et `/check-in/1` → 200, titre correct. Contenu du chunk `event-checkin` vérifié via `curl` + `grep` (présence de `kiosk-flash`, confirmant que le vrai code est servi, pas un fallback vide). Écran caméra/scan et animation eux-mêmes non vérifiables sans navigateur + vraie caméra.

### `erp_validate_event` : flux valider-puis-placer, calendrier, centrage (2026-07-29, pas testée en navigateur)

Trois ajustements demandés juste après la construction initiale de l'app.

- **Backend — nouvel endpoint `POST /event-tickets/{id}/assign-table`** (`EventTicketController::assignTable`) : attribue une place à un ticket **déjà validé** (`validated_at` non nul) qui n'en a pas encore (422 sinon dans les deux cas). Les contrôles "table dans la bonne salle" / "table pas déjà prise" ont été factorisés dans une méthode privée `resolveFreeTable()` partagée avec `validateCode` (qui accepte toujours `table_id` en option — consommé par le dashboard `erp-app` qui, lui, laisse choisir la place *avant* de valider ; `erp_validate_event` ne l'utilise plus).
- **Flux revu dans `event-checkin.ts`** : `validate(code)` n'envoie plus `table_id` — valide toujours le code seul en premier. Si succès **et** `event.room_id` renseigné **et** le ticket n'a pas déjà de place (cas où `erp-app` l'aurait déjà placé autrement), une **modal** s'ouvre automatiquement (`showSeatModal`/`pendingTicket`) avec le plan de salle ; sélectionner une place libre puis "Attribuer cette place" appelle le nouvel endpoint. Bouton "Passer" pour ignorer le placement sans bloquer le flux. Pendant que la modal est ouverte, `canValidateNow()` bloque toute nouvelle validation (scan ou clavier) pour éviter qu'un scan parasite n'interrompe l'attribution en cours.
- **Bug découvert en construisant la modal** : les classes `.checkin-table`/`.checkin-canvas`/`.legend-dot*` référencées dans le template depuis la construction initiale de cette app n'étaient en fait **définies nulle part** — ni dans `styles.css` global (copié de `erp-app`, où ces classes vivent en réalité dans des CSS *scopés par composant*, jamais globaux), ni dans le CSS local de `event-checkin`. Le plan de salle aurait donc été rendu sans positionnement absolu ni style (tables empilées en haut à gauche, illisible). Corrigé en ajoutant ces classes dans `event-checkin.css` (repris du style déjà utilisé côté `erp-app`).
- **Centrage caméra/clavier** : `.kiosk-body` passe de `display:grid;grid-template-columns:1fr 1fr` (caméra/clavier à gauche, plan de salle visible en permanence à droite) à un simple `display:flex;align-items:center;justify-content:center` — cohérent avec le nouveau flux où le plan n'apparaît plus qu'en modal ponctuelle, plus besoin de lui réserver une colonne fixe.
- **`event-select.ts`** : même toggle Liste/Calendrier que `event-list.ts` côté `erp-app` (logique de grille mensuelle copiée telle quelle — semaine commençant lundi, navigation mois précédent/suivant, "Aujourd'hui"). Dans la vue Liste, une tuile événement du jour reçoit un badge "Aujourd'hui" **et** une variante de couleur (`.event-tile--today`, fond/bordure verts) plutôt qu'un badge seul, pour être repérable d'un coup d'œil sur un écran de kiosque. `.calendar-event` (classe globale pensée pour un `<a>` dans `erp-app`) réutilisée en `<button>` ici avec un petit reset CSS local (pas de `routerLink` direct dans cette app, la sélection passe par `select()` → `router.navigate`).
- **Vérifié sans navigateur** : backend — séquence complète en `curl` (vendre place → valider sans table → 200 avec `table_id:null` → `assign-table` → 200 avec la table attribuée → ré-attribution rejetée en 422 → tentative d'attribution sur un ticket non validé rejetée en 422). Frontend — build Docker propre (aucune erreur de compilation sur les 3 fichiers modifiés), contenu réel confirmé dans les chunks servis via `curl`+`grep` (`event-tile--today`, `Calendrier`, `modal-panel--wide`, `Choisir une place`).

### Accès caméra depuis un iPad/téléphone : tunnel ngrok, testé puis retiré (2026-07-29)

`getUserMedia` (scan QR) exige un "contexte sécurisé" (HTTPS, ou `localhost`) — un navigateur refuse silencieusement l'accès caméra sur `http://<IP LAN>:19003`. Deux pistes tentées pour un test ponctuel depuis un iPad :

- **`--ssl` (certificat auto-généré par Angular CLI) — abandonné.** Cassait autre chose côté utilisateur (jamais diagnostiqué précisément — vraisemblablement le WebSocket de live-reload de Vite qui n'aime pas un certificat auto-signé non approuvé manuellement, ou l'écran de confiance iOS qui bloque plus que Safari desktop).
- **Tunnel `ngrok` — fonctionnait** (`brew install ngrok`, authtoken utilisateur, `ngrok http 19003` → URL HTTPS publique avec un vrai certificat, caméra confirmée opérationnelle sur l'iPad). Nécessitait un proxy `/api` → `http://api:80` (service Docker interne) côté `ng serve` (`proxy.conf.json` + `API_URL` relatif) pour éviter le blocage "contenu mixte", plus `--allowed-hosts` pour que Vite accepte le domaine `ngrok-free.dev` généré dynamiquement.

**Tout a été retiré à la demande de l'utilisateur une fois le test concluant** — il gérera le HTTPS proprement au déploiement en production (reverse proxy + certificat valide sur le vrai domaine, cf. échange sur le déploiement). État actuel du repo redevenu identique à avant ce test : `docker-entrypoint.sh` en HTTP simple sans proxy, `API_URL` basé sur `` `http://${window.location.hostname}:19001/api` ``, pas de `proxy.conf.json`. Tunnel ngrok arrêté (processus tué), rien de ça n'est dans `docker-compose.yml`.

**À refaire en prod** (pas dans ce repo, noté pour mémoire) : servir `erp_validate_event` (et l'API) derrière un reverse proxy avec un certificat valide (Let's Encrypt ou équivalent) — les deux origines doivent être en HTTPS, pas seulement le front, sinon même blocage "contenu mixte" qu'en local.

### Son de confirmation/refus dans erp_validate_event (2026-07-29, pas testée en navigateur)

Demandé : un son quand une place est validée, un autre quand elle est refusée. Généré via **Web Audio API** (`AudioContext` + `OscillatorNode`) directement dans `event-checkin.ts` plutôt que des fichiers audio — rien à héberger/bundler, aucun souci de format, fonctionne même si le kiosque est hors ligne au moment du scan. Succès : deux notes montantes (La5 880Hz → Mi6 1318Hz, onde sinusoïdale). Refus : deux notes graves en dents de scie (220Hz → 174Hz). Déclenché depuis `showResult()`, donc couvre scan caméra et saisie clavier de la même façon (chemin de validation commun). `AudioContext` créé une seule fois (lazy, réutilisé), fermé dans `ngOnDestroy`. `ctx.resume()` appelé avant chaque son au cas où le navigateur l'ait suspendu (politique d'autoplay) — la première interaction (toggle scan/clavier, bouton Valider) le débloque de toute façon avant le premier scan caméra automatique.

### `rooms.type` : restaurant vs événement (2026-07-29)

Demandé : distinguer les salles pensées pour le plan de salle du POS Restaurant de celles pensées pour le placement strict des événements.

- Migration additive `2026_07_29_150000_add_type_to_rooms_table.php` (`Schema::table`, pas une édition de `create_rooms_table.php` — contrairement à la convention "éditer en place tant qu'aucune donnée de prod n'existe" suivie plus tôt dans le projet, cette fois il y a de vraies données créées durant cette session — salles, tables, tickets, événements — qu'un `migrate:fresh` aurait détruites). `type` en `string`, défaut `'restaurant'` (les 2 salles de démo existantes datent d'avant ce champ et servaient au plan de salle restaurant).
- `RoomController` valide `type` avec `in:restaurant,event` (requis) sur `store`/`update`.
- Frontend (`erp-app`) : `room-form` a un `<select>` Restaurant/Événement (signal `type`, défaut `'restaurant'` pour une nouvelle salle) ; `room-list` affiche une colonne Type (badge bleu "Événement" / neutre "Restaurant").
- **Volontairement pas de filtrage ajouté ailleurs** (ex. le `<select>` "Salle" du formulaire événement `erp-app` continue de lister toutes les salles, pas seulement `type=event`) — seulement demandé d'ajouter le champ, pas de changer le comportement des sélecteurs existants. Un filtrage par type serait une suite logique si demandé.
- **Vérifié via `curl`** : migration appliquée sans perte des salles/tables/événements déjà créés (`GET /api/rooms` confirme `type:"restaurant"` sur les salles existantes) ; création avec `type:"event"` → 201 ; `type` invalide → 422 "The selected type is invalid." ; `type` manquant → 422 "The type field is required." Build Angular propre.

## Restructuration majeure : Event → Event + EventDate (2026-07-29)

Demandé : un "event" (ex. "Concert de Jazz") n'a plus une seule date — il devient un conteneur (juste `name`/`slug`), et chaque occurrence (date/heure/salle/limite de places) vit dans une nouvelle table `event_dates`. Flux attendu : "créer un event puis ajouter des dates, heure, places, room". Impact en cascade sur les 3 apps (`erp-api`, `erp-app`, `erp_validate_event`) — les places vendues (`event_tickets`) se rattachent maintenant à une **date précise**, plus à l'event générique.

### Backend
- **Migrations** : `create_events_table` réédité (`name`+`slug` seulement, tout le reste retiré). Nouvelle `create_event_dates_table` (`date`, `start_hour`, `event_id`, `room_id` nullable, `number_place_limit` nullable). `create_event_tickets_table` **renommée** (`..._130001_...` → `..._130002_...`, pour s'insérer après `event_dates` dans l'ordre d'exécution) et éditée : `event_id` → `event_date_id`.
- **Piège de migration** : ces 3 tables avaient déjà des données réelles de cette session (events/tickets créés dans les échanges précédents), contrairement aux tout premiers scaffolds du projet où `migrate:fresh` suffisait. Un `migrate:fresh` aurait aussi effacé clients/salles/produits/tickets POS sans rapport. **Chirurgie ciblée** à la place : `DROP TABLE` sur seulement `event_tickets`/`events`/`event_dates` + suppression des lignes correspondantes dans la table `migrations` (sinon Laravel les croit déjà appliquées et ne rejoue pas les nouvelles définitions — même piège que documenté plus haut dans ce fichier pour `catalog_product`), puis `docker compose up -d api` relance l'entrypoint (`migrate --force` + `db:seed --force`) qui réapplique tout proprement. Vérifié après coup : `clients`/`rooms`/`products` intacts (mêmes comptes qu'avant), `events` reparti de zéro.
- **Modèles** : `Event` (`HasSlug`, relation `dates()` hasMany `EventDate`, plus de champs date/salle/limite). `EventDate` (nouveau — `casts: date`, relations `event()`, `room()`, `tickets()`). `EventTicket.event()` → `eventDate()` (`belongsTo EventDate`).
- **`EventController`** simplifié à `name` seul ; `index`/`show`/`store`/`update` utilisent `withCount('dates')`/`loadCount` (pas besoin de charger toutes les dates pour la liste des events).
- **`EventDateController`** (nouveau) : `store` imbriqué sous l'event (`POST /events/{event}/dates`, comme `TableElementController` sous `Room`) ; `index` accepte un `event_id` **optionnel** — sans lui, renvoie toutes les dates tous events confondus (c'est ce qu'utilise `erp_validate_event`, qui n'a pas de notion d'"event courant", juste "quelle occurrence contrôler à cette entrée") ; `show`/`update`/`destroy` shallow.
- **`EventTicketController`** : `index`/`store` filtrent par `event_date_id` (plus `event_id`) ; vérification `number_place_limit` déplacée sur `EventDate` ; `validateCode`/`assignTable`/`resolveFreeTable` utilisent `$ticket->eventDate` (renommé depuis `$ticket->event`).
- **`EventTicketsMail`** : constructeur prend un `EventDate` (plus un `Event`) ; sujet/vue utilisent `$eventDate->event->name` + `$eventDate->date`/`start_hour` (l'occurrence précise, pas juste le nom du spectacle).
- **Routes** : `apiResource('events', ...)` inchangé. Nouvelles routes explicites (pas de resource imbriquée standard, `index` doit rester accessible sans event_id) : `GET /event-dates` (liste globale ou filtrée), `POST /events/{event}/dates`, `GET|PUT|DELETE /event-dates/{event_date}`.

### `erp-app`
Restructuration de `/evenements` en 2 niveaux :
- **`/evenements`** (`event-list`) — simplifié : juste la liste des events (nom + nombre de dates programmées), CRUD. Le calendrier/tri par proximité/surbrillance "aujourd'hui" **construits plus tôt dans la session ont été déplacés**, pas dupliqués — ils n'avaient plus de sens ici puisqu'un event n'a plus une date unique.
- **`/evenements/nouveau`, `/evenements/:id/modifier`** (`event-form`) — simplifié à un seul champ `name`. Après création, redirige directement vers `/evenements/:id` (pas la liste) pour enchaîner sur l'ajout de dates — cohérent avec le flux demandé.
- **`/evenements/:id`** (`event-detail`, nouveau) — le calendrier/liste/tri par proximité/surbrillance "aujourd'hui" d'origine, **rescopés aux dates de cet event** (plus tous events confondus). Formulaire d'ajout/édition de date inline (même pattern que l'édition de ticket ailleurs : un même formulaire bascule entre "Ajouter" et "Modifier" via `editingDateId`). Le `<select>` Salle ne montre que les salles `type: 'event'` (voir section précédente sur `rooms.type` — première utilisation réelle de ce filtre, justifiée ici puisque c'est un formulaire neuf, contrairement à l'ancien formulaire événement qui n'avait volontairement pas été retouché sur ce point).
- **`/evenements/:id/dates/:dateId`** (`event-dashboard`, rescopé) — anciennement "par event", maintenant "par date d'un event" : vente de places, validation, placement, impression QR — toute la logique interne inchangée, juste `eventId`/`event_id` remplacés par `eventDateId`/`event_date_id` partout, et l'en-tête affiche `eventDate.event.name` + la date/heure de cette occurrence précise plutôt qu'un nom d'event seul.

### `erp_validate_event`
Même principe : `EventService` remplacé par `EventDateService` (l'app n'a jamais eu besoin de gérer des `Event` à proprement parler, seulement de choisir une occurrence). `event-select` liste maintenant des `EventDate` (toujours filtrées aux occurrences non passées, tuile affiche `eventDate.event.name` + date/heure). `event-checkin` route `/check-in/:id` où `:id` est désormais un `event_date_id` (le nom du paramètre URL n'a pas changé, juste ce qu'il représente).

### Vérifié (curl, pas de navigateur — cohérent avec les sessions précédentes sur ce projet)
Migration appliquée sans perte des données non liées aux events (clients/rooms/products confirmés intacts après coup). Séquence complète : créer un event → ajouter 2 dates → vendre 2 places sur la date 1 uniquement → confirmé 0 place sur la date 2 (isolation correcte) → limite de places vérifiée par date (rejet propre "il ne reste que N places... pour cette date"). Build Angular propre sur `erp-app` et `erp_validate_event`, contenu réel confirmé dans les chunks servis (`curl`+`grep`).

### `/evenements` — bouton "Vendre des places" + page `event-date-select` (2026-07-29, pas testée en navigateur)

Demandé : depuis `/evenements`, un accès direct à la vente de places sans passer par le détail d'un event précis. Nouvelle page `event-date-select` (`/evenements/vente`, doit précéder `:id` dans `app.routes.ts` sinon `vente` serait interprété comme un id) : liste **toutes** les `EventDate` de **tous** les events confondus, filtrées aux occurrences non passées, triées chronologiquement, occurrence du jour surlignée (même logique que le calendrier `event-detail`). Chaque ligne renvoie vers `/evenements/{eventId}/dates/{dateId}` (le dashboard de vente existant). `event-list` gagne un deuxième bouton topbar `🎟️ Vendre des places` à côté de `+ Ajouter`.

### DatePicker / TimePicker réutilisables (2026-07-29, pas testée en navigateur)

Demandé : remplacer les `<input type="date">`/`<input type="time">` natifs par des composants plus soignés, dans le même langage visuel que le reste de l'app.

- `shared/date-picker` et `shared/time-picker`, standalone, implémentent `ControlValueAccessor` (provider `NG_VALUE_ACCESSOR` + `forwardRef`) — donc utilisables en drop-in avec le pattern `[ngModel]`/`(ngModelChange)` déjà en place partout, sans toucher la forme des formulaires existants. Valeur exposée identique au natif : `"YYYY-MM-DD"` (date) / `"HH:mm"` (heure), ou `null`.
- `date-picker` réutilise les classes `.calendar-grid`/`.calendar-cell` déjà établies (grille mensuelle, semaine commençant lundi). `time-picker` : popover à deux colonnes (Heures/Minutes), fermeture au clic extérieur via `@HostListener('document:click')` + `ElementRef.contains()`.
- **Minutes limitées aux quarts d'heure** (`00`/`15`/`30`/`45`, pas `00`-`59`) — suffisant pour une heure de début d'événement, colonne plus rapide à parcourir. La liste ne défile plus (hauteur `auto`), avec `scrollSelectedIntoView()` volontairement restreint à la colonne Heures pour ne pas déclencher un saut de scroll sur la page entière quand la colonne Minutes (non scrollable) est ciblée par erreur.
- Bug de typage rencontré et corrigé dans les deux composants : `inject(ElementRef<HTMLElement>)` (argument de type générique passé à `inject()`) compile mais fait perdre le type de `nativeElement` (`any`), cassant l'inférence sur un `querySelectorAll<HTMLElement>()` plus loin. Fix : `inject<ElementRef<HTMLElement>>(ElementRef)`.

### Ajout de dates par lot dans `/evenements/:id` (2026-07-29, pas testée en navigateur)

Demandé : dans le formulaire "Ajouter une date" d'`event-detail`, pré-remplir date du jour + heure 21:00 par défaut, permettre d'ajouter plusieurs dates d'un coup et de tout enregistrer en une seule action, chaque nouvelle ligne ajoutée incrémentant la date de la précédente de un jour.

- Les 4 signaux de formulaire séparés (`formDate`/`formStartHour`/`formRoomId`/`formNumberPlaceLimit`) sont remplacés par un seul `pendingDates = signal<PendingDate[]>(...)`, un tableau de lignes. Le template boucle dessus (`@for (row of pendingDates(); track $index)`), chaque champ récupère un `name` unique (`'date-' + $index`, etc. — obligatoire pour des `ngModel` multiples dans un même `<form>` template-driven).
- `defaultRow(base?)` : sans argument → date du jour + `21:00` (nouveau formulaire vide) ; avec une ligne de base → mêmes salle/limite/heure que la précédente mais `date` incrémentée de un jour (`addDays`), pour enchaîner rapidement plusieurs soirs consécutifs d'un même event.
- `addPendingRow()`/`removePendingRow()` (minimum 1 ligne, pas de suppression de la dernière) manipulent le tableau ; bouton ✕ par ligne masqué s'il n'en reste qu'une ou en mode édition.
- Sauvegarde par lot via `forkJoin` (`rxjs`) sur `pendingDates().map(row => eventDateService.create(...))` — un seul callback `next`, une seule remise à zéro du formulaire, un seul `refreshDates()` après que **toutes** les créations aient réussi.
- Le mode édition (`startEdit`) reste volontairement mono-ligne : `pendingDates` est réinitialisé à un tableau à un seul élément et le bouton "+ Ajouter une autre date" est masqué — modifier une date existante n'a pas de sens en lot.
- **Vérifié uniquement par compilation** (`docker logs erp_v2_app` → "Application bundle generation complete", aucune erreur TS) — pas de test navigateur, conformément à la consigne.

### Import markdown d'événements + dates dans `/evenements` (2026-07-29, pas testée en navigateur)

Demandé : pouvoir importer en une fois une liste d'événements et de dates depuis du texte markdown, en créant l'event s'il n'existe pas déjà.

- Bouton "📥 Importer (markdown)" sur `event-list`, ouvre une modal (`modal-panel--wide`, nouvelle classe globale — `.modal-panel` seul plafonne à 480px, trop étroit pour un textarea confortable) avec un `<textarea>` + un exemple de format affiché en dur au-dessus.
- **Format** : un titre markdown (`#` à `######`, peu importe le niveau) = nom d'événement, suivi de lignes `- AAAA-MM-JJ` ou `- AAAA-MM-JJ HH:MM` (`*` accepté aussi) = ses dates. Heure omise → `21:00` par défaut (cohérent avec le défaut déjà choisi pour l'ajout manuel de dates dans `event-detail`). Parsing fait entièrement côté client (`parseImportMarkdown`, deux regex simples), aucune dépendance markdown ajoutée — pas besoin d'un vrai parseur pour un format aussi contraint.
- **Dédoublonnage par nom** (insensible à la casse) contre les events déjà chargés dans `events()` : si trouvé, seules ses nouvelles dates sont ajoutées (pas de nouvel event créé) ; sinon `EventService.create({name})` puis les dates s'accrochent au nouvel id. Le dédoublonnage tient compte aussi des events **créés pendant l'import lui-même** (deux blocs `## Même Nom` séparés dans le même texte collé fusionnent sur le même event) grâce à un `events.update()` local après chaque création.
- Séquentiel (`await firstValueFrom(...)` en boucle, pas de `forkJoin`) plutôt qu'en parallèle : les dates d'un événement donné dépendent de l'id retourné par la création de cet événement, donc au moins un point de synchronisation par groupe est nécessaire ; le tout est fait séquentiellement pour rester simple et donner un message d'erreur clair pointant sur le bon événement en cas d'échec partiel (pas de rollback — les groupes déjà importés avant l'erreur restent en base).
- Résumé affiché après import ("N événement(s) créé(s), N date(s) ajoutée(s)"), puis rafraîchissement de la liste. Erreurs de validation backend (422, ex. date invalide) remontées telles quelles.
- **Vérifié uniquement par compilation** (`docker logs erp_v2_app` → "Application bundle generation complete", aucune erreur TS) — pas de test navigateur, conformément à la consigne.

## Nouveau module Réservation (`/reservations`) (2026-07-29)

Demandé : un module de réservation restaurant séparé des Events — enregistrer une réservation (client, type de repas, date, heure au quart d'heure, nombre de personnes), lister avec tri et filtre par jour, valider la réservation d'un client. [[Et pour le nombre de place et la selection de la salle ?]] avait été discuté avant l'implémentation : décision de **ne pas lier la réservation à une salle/table précise** pour l'instant (comme pour les tickets d'événement au départ) — seul `number_of_guests` est stocké, le placement physique reste géré séparément par le plan de salle du POS Restaurant si besoin plus tard.

### Backend
- Nouvelle table `bookings` (migration `2026_07_29_190000_create_bookings_table.php`) : `client_id` (FK `restrictOnDelete`, comme `event_tickets` — on ne supprime pas un client qui a des réservations), `number_of_guests` (unsigned int), `type` (string libre + validation `in:breakfast,lunch,dinner` côté contrôleur, même convention que `rooms.type`), `date`, `hour` (colonnes `date`/`time` natives, comme `event_dates`), `validated_at` (timestamp nullable, marque le "check-in" du client).
- Modèle `Booking` (`casts()`: `date` → `date`, `validated_at` → `datetime`), relation `client()`. `Client` gagne une relation `bookings()` (même pattern que `orders()`/`tickets()`).
- `BookingController` : `index` (eager-load `client`, filtre optionnel `?date=AAAA-MM-JJ` via `whereDate` + `when()`, tri par défaut `date`/`hour` — le tri interactif se fait côté front comme pour `EventDate`), `show`, `store`, `update`, `destroy`, et `validateBooking` (`POST bookings/{booking}/validate`, `forceFill(['validated_at' => now()])->save()` — même idiome que `EventTicketController::validateCode`, mais sans code à saisir puisqu'une réservation se retrouve directement par id depuis la liste du jour, pas via un scan/une saisie cliente).
- Routes explicites (pas `apiResource`, comme `event-tickets`) : `GET|POST bookings`, `GET|PUT|DELETE bookings/{booking}`, `POST bookings/{booking}/validate`.
- **Vérifié via `curl`** : création (201, avec `client` eager-chargé), type invalide → 422 "The selected type is invalid.", filtre `?date=` isole bien le bon jour, `validate` pose `validated_at`.

### `erp-app`
- `core/models/booking.model.ts` (`Booking`, `BookingPayload`, `BookingType`), `core/booking.service.ts` (`list(date?)`, `get`, `create`, `update`, `remove`, `validate`).
- **`booking-list`** (`/reservations`) : filtre par jour via `app-date-picker` (défaut aujourd'hui, requête refaite au backend à chaque changement — pas un filtre client-side sur une liste déjà chargée), bouton "Toutes les dates" pour tout voir, boutons "Aujourd'hui". Tri interactif (client/type/heure/personnes) répliqué à l'identique du pattern `event-detail` (`sortField`/`sortDir` signals, `toggleSort`/`sortIndicator`, `computed sortedBookings`). Badge de statut (Validée / En attente), bouton "Valider" visible seulement si `validated_at` est `null`.
- **`booking-form`** (`/reservations/nouveau`, `/reservations/:id`) : sélecteur client **copié tel quel du POS Vente directe** (recherche débouncée dès 2 caractères via `ClientService.search()`, `+ Nouveau client` en création rapide inline) — les classes CSS `.pos-client*` étaient déjà globales (`styles.css`), pas scopées à `pos-vente`, donc réutilisables sans dupliquer de CSS. Type de repas en `<select>` avec libellés français (Petit déjeuner/Déjeuner/Souper) mappés sur les valeurs backend `breakfast/lunch/dinner`. Date et heure via `app-date-picker`/`app-time-picker` déjà existants (heure donc déjà contrainte aux quarts d'heure par le composant, cohérent avec "heure tous les quart d'heure" demandé — pas de contrainte de quart d'heure ajoutée côté backend, même choix que pour les dates d'événement).
- Nouvelle entrée nav "📅 Réservations" dans `shell.ts`, juste après "Événements".
- **Vérifié via `curl`** (backend) + compilation Angular propre (`docker logs erp_v2_app`, chunks `booking-list`/`booking-form`/`shell` générés sans erreur) — pas de test navigateur interactif, conformément à la consigne.

### Import markdown : salle + limite de places par date (2026-07-29, pas testée en navigateur)

Suite immédiate de l'import markdown ci-dessus : chaque ligne de date accepte deux segments optionnels séparés par `|`, dans cet ordre précis : `- AAAA-MM-JJ HH:MM | Nom de la salle | Limite de places` (ex. `- 2026-08-15 21:00 | Salle Principale | 80`).

- Regex étendue (`IMPORT_DATE_RE`) plutôt qu'un vrai tokenizer — le format reste une seule ligne à structure fixe, pas besoin de plus.
- La salle est résolue **par nom exact** (insensible à la casse) contre les salles déjà chargées (`RoomService.list()`, pas de filtre `type` ici — contrairement à `event-detail`, l'import ne fait pas de distinction stricte, une salle "restaurant" mal nommée dans le markdown resterait juste non trouvée). Salle introuvable → `room_id` laissé `null` (la date est quand même créée, en admission libre) et son nom accumulé dans un résumé d'avertissement affiché après import ("⚠️ Salle introuvable, ignorée pour : ..."), plutôt que de faire échouer tout l'import pour une simple faute de frappe de salle.
- La limite de places, si présente, est juste parsée en entier et transmise telle quelle (déjà validée côté backend comme les autres champs de date).
- **Vérifié uniquement par compilation** (`docker logs erp_v2_app` → "Application bundle generation complete", aucune erreur TS) — pas de test navigateur, conformément à la consigne.

### `booking-list` : filtre par type + total de personnes (2026-07-29, pas testée en navigateur)

Suite du module Réservation ci-dessus : filtre par type de repas (pastilles "Tous / Petit déjeuner / Déjeuner / Souper", filtré **côté client** — contrairement au filtre par jour qui refait un appel backend, la liste du jour est déjà entièrement chargée) combiné au filtre par jour existant dans un `computed filteredBookings`. Deux totaux affichés au-dessus du tableau, dérivés du même `computed` (donc toujours cohérents avec les filtres actifs) : nombre de réservations et somme de `number_of_guests` (`totalGuests`). Vérifié uniquement par compilation.

### Recherche par nom (`/produits`) et par nom + date (`/evenements/vente`) (2026-07-29, pas testée en navigateur)

Filtrage purement côté client (les listes sont déjà entièrement chargées en mémoire, pas d'aller-retour réseau) :
- `product-list` : `nameFilter` (signal string) ajouté dans la chaîne `filteredProducts` existante (déjà filtrée par catalogue/catégorie) — recherche insensible à la casse, sous-chaîne (`includes`), pas de correspondance exacte.
- `event-date-select` (`/evenements/vente`) : même principe, `nameFilter` (nom d'event) + `dateFilter` (via `app-date-picker`, `null` = toutes les dates) combinés dans `upcomingDates`, en plus du filtre "non passé" déjà en place. `dateFilter` compare la clé `AAAA-MM-JJ` exacte (pas une plage).
- **Vérifié uniquement par compilation** (`docker logs erp_v2_app` → "Application bundle generation complete", aucune erreur TS) — pas de test navigateur, conformément à la consigne.

## Tableau de bord réel (2026-07-29)

L'ancien `/` (`dashboard.ts`/`.html`) était une pure maquette de démo du style guide — noms, montants et statuts inventés, aucune donnée réelle. Remplacé par un vrai dashboard branché sur les services existants.

- **4 stat-cards** : Ventes du jour (montant + nb de tickets), Réservations aujourd'hui (nb + total personnes), Événements à venir (nb), Produits actifs (nb).
- **3 mini-listes** (grille `auto-fit minmax(320px,1fr)`, une carte par domaine, chacune avec un lien "Voir tout →" vers sa page complète sauf les tickets, qui n'ont pas de page de liste dédiée) : réservations du jour (`BookingService.list(today)`), 5 prochains événements tous events confondus (même logique de tri que `event-date-select`), 8 derniers tickets encaissés.
- **Nouvel endpoint backend** `GET /api/tickets` (`TicketController::index`, absent jusqu'ici — seul `POST /tickets` existait) : `?limit=` optionnel (défaut 10), trié par `paid_at` décroissant, eager-load `client`/`sections.lines.product`/`payments.paymentMethod`. `TicketService.list(limit?)` côté front.
- **Piège évité sur "Ventes du jour"** : il n'existe pas d'agrégat SQL dédié ("somme des ventes d'aujourd'hui"), seulement une liste des N derniers tickets. Récupérer seulement les 8 tickets affichés dans la mini-liste aurait sous-compté le total du jour dès qu'il y a plus de 8 ventes. Solution : `TICKETS_FETCH_LIMIT = 50` récupérés en mémoire (`fetchedTickets`), la mini-liste affichée n'en montre que les 8 premiers (`recentTickets = computed(() => fetchedTickets().slice(0, 8))`) mais la stat filtre sur les 50 pour un total plus fiable — reste une approximation (un jour à plus de 50 ventes sous-compterait), acceptable vu qu'il n'y a pas d'endpoint d'agrégation dédié pour l'instant.
- Total d'un ticket calculé côté front (`ticketTotal()`, somme `quantity × unit_price` sur toutes les lignes de toutes les sections) — pas de champ `total` précalculé côté backend.
- **Vérifié via `curl`** sur les 4 sources de données (bookings du jour, event-dates à venir, tickets, produits actifs) + compilation Angular propre. **Pas de vérification interactive en navigateur réel** : aucun outil d'automatisation navigateur (Playwright/screenshot) n'était disponible dans cet environnement pour cette tâche — seule la couche données + la compilation ont pu être vérifiées, à signaler explicitement à l'utilisateur.

## Nouveau module Fond de caisse (`/caisse`) (2026-07-29)

Demandé : ouvrir/fermer un fond de caisse et valider les paiements par utilisateur. Proposition de schéma discutée avant implémentation (voir échange précédent) : deux pièces plutôt qu'une seule grosse table — `cash_sessions` (un cycle ouverture→fermeture) + deux colonnes ajoutées sur `ticket_payments` existante (`user_id`, `cash_session_id`) plutôt qu'une table de "validation" séparée.

### Contrainte de départ : pas d'auth
Le projet n'a toujours pas de login (voir note en tête de `routes/api.php`). "Par utilisateur" ne peut donc pas s'appuyer sur un utilisateur connecté — le caissier est **choisi manuellement** dans `/caisse` (liste des `users` existants), persisté en `localStorage` (`erp-v2-cashier-user-id`) côté `erp-app` pour survivre à un rechargement de page/kiosque. Ce choix n'est *pas* une session serveur : deux onglets/postes différents peuvent avoir des caissiers différents.

### Backend
- **Migration** `create_cash_sessions_table` : `user_id` (FK `restrictOnDelete`), `opening_amount`, `opened_at`, `closing_amount`/`expected_amount`/`discrepancy` (nullables, remplis à la fermeture), `closed_at`, `closed_by_user_id` (FK `users` nullable — permet qu'un autre utilisateur que celui qui a ouvert ferme la caisse), `note`. Pas de colonne `status` : une session est "ouverte" tant que `closed_at IS NULL`.
- **Migration** `add_cash_session_to_ticket_payments_table` : ajoute `user_id`/`cash_session_id` (nullables, `nullOnDelete`) sur `ticket_payments` — nullable pour rester rétrocompatible avec les paiements déjà en base et avec une vente faite sans caisse ouverte.
- **Modèle `CashSession`** (`casts()` sur les 4 montants + les 2 timestamps), relations `user()`, `closedBy()`, `payments()` (`hasMany TicketPayment`). `TicketPayment` gagne `user()`/`cashSession()`. `User` gagne `cashSessions()`.
- **`CashSessionController`** :
  - `index` (filtre optionnel `user_id`, `latest('opened_at')`)
  - `active` (`GET cash-sessions/active?user_id=`) : renvoie la session ouverte de cet utilisateur, ou aucune. **Piège découvert en testant** : `response()->json(null)` ne renvoie **pas** `null` en JSON mais `{}` — comportement de `Symfony\Component\HttpFoundation\JsonResponse::setData()`, pas un bug côté appli. Le front (`CashSessionService.active()`) normalise ça avec `'id' in session ? session : null` plutôt que de tester `=== null`.
  - `store` : rejette (422) l'ouverture d'une 2ᵉ session pour un utilisateur qui en a déjà une ouverte.
  - `close` : rejette (422) la fermeture d'une session déjà fermée. Calcule `expected_amount = opening_amount + somme des paiements de la session dont le moyen de paiement a le slug 'especes'` (whereHas sur la relation `paymentMethod`), puis `discrepancy = closing_amount - expected_amount`. `closed_by_user_id` par défaut = `user_id` de la session si non précisé.
  - `show` : eager-load `payments.paymentMethod`, `payments.user`, `payments.ticket` — c'est la vue de réconciliation "paiements par utilisateur".
- **`TicketController::store`** : accepte `cash_session_id` optionnel dans le payload. Si fourni, chaque `TicketPayment` créé est stampé avec `user_id`/`cash_session_id` **de la session** (pas un champ envoyé séparément par le front) — cohérent avec "pas d'auth, le caissier = celui qui a la caisse ouverte".
- Routes explicites ajoutées à la fin de `api.php` : `GET|POST cash-sessions`, `GET cash-sessions/active` (**avant** `{cash_session}` sinon "active" serait interprété comme un id), `GET cash-sessions/{cash_session}`, `POST cash-sessions/{cash_session}/close`.
- **Vérifié via `curl`** end-to-end : ouverture → rejet d'une 2ᵉ ouverture pour le même utilisateur → vente en espèces rattachée à la session (paiement stampé `user_id`/`cash_session_id` corrects) → fermeture avec `expected_amount`/`discrepancy` calculés juste (100 + 9 = 109, écart 0) → re-fermeture rejetée (422) → `active` revient à `{}` après fermeture.

### `erp-app`
- `core/models/cash-session.model.ts`, `core/cash-session.service.ts` (`list`, `active`, `get`, `open`, `close`).
- **`ActiveCashierService`** (`providedIn: 'root'`, nouveau) : état partagé du caissier choisi + sa session active, lu depuis `localStorage` au démarrage puis synchronisé avec le backend. Partagé entre `/caisse` (qui l'écrit) et `pos-vente` (qui le lit pour poser `cash_session_id` sur `CreateTicketPayload` — `pos-vente.ts` importe désormais ce service). `pos-vente.html` affiche un badge "💶 Caisse ouverte — {{ user }}" ou un lien "Aucune caisse ouverte — Ouvrir" vers `/caisse` dans le topbar.
- **`/caisse`** (`cash-register-home`) : sélecteur de caissier (si aucun choisi) → formulaire d'ouverture (montant du fond) ou récapitulatif de la session ouverte + bouton "Fermer la caisse" (formulaire montant compté, affiche l'écart après confirmation) → historique de **toutes** les sessions (tous utilisateurs), triable visuellement par statut ouverte/fermée, chaque ligne renvoie vers le détail.
- **`/caisse/:id`** (`cash-session-detail`) : la vue "valider les paiements par utilisateur" — 4 stat-cards (fond d'ouverture, total des paiements, fond compté, écart), totaux par moyen de paiement, puis tableau des paiements avec la colonne "Encaissé par" (nom d'utilisateur) et le ticket d'origine. Fonctionne pour une session ouverte ou fermée.
- Entrée nav "💶 Fond de caisse" ajoutée après "Réservations".
- **Vérifié via `curl`** (backend complet ci-dessus) + compilation Angular propre (`docker logs erp_v2_app`, chunks `cash-register-home`/`cash-session-detail`/`pos-vente` régénérés sans erreur — un piège de build passager rencontré : le `.ts` de `cash-session-detail` a été écrit avant son `.html`, ce qui a fait échouer 4 rebuilds successifs jusqu'à ce qu'un nouveau changement soit détecté après l'écriture du `.html`). **Pas de vérification interactive en navigateur** (même limitation que le dashboard ci-dessus, aucun outil de screenshot/Playwright disponible dans cet environnement) — seules la couche données et la compilation ont été vérifiées.

### Fermeture multi-moyens de paiement (2026-07-29)

Correction demandée juste après la mise en place du module ci-dessus : "il faut ouvrir la caisse pour les espèces mais fermer et vérifier tous les moyens de paiement". L'ouverture reste espèces uniquement (`opening_amount`, inchangé) mais la fermeture doit désormais faire compter **chaque** moyen de paiement utilisé (carte, Bancontact, chèque-repas...), pas seulement les espèces.

- **Nouvelle table `cash_session_counts`** (une ligne par moyen de paiement compté à la fermeture d'une session) : `cash_session_id`, `payment_method_id`, `expected_amount`, `counted_amount`, `discrepancy`, contrainte `unique(cash_session_id, payment_method_id)`. Nouveau modèle `CashSessionCount`, relation `CashSession::counts()`.
- **`CashSessionController::close` réécrit** : payload passe de `{closing_amount}` à `{counts: [{payment_method_id, counted_amount}, ...]}`. Pour chaque entrée, `expected_amount` = somme des `ticket_payments` de la session pour ce moyen ; **exception pour les espèces** : `expected_amount` inclut en plus `opening_amount` (seul le fond de caisse a un "fond d'ouverture" — les autres moyens n'ont que leurs ventes). Rejette (422 "Le comptage des espèces est obligatoire à la fermeture.") si aucune entrée `counts` ne correspond au moyen de paiement `slug: 'especes'` — c'est le seul obligatoire, les autres sont libres (un jour sans carte, par ex., n'a pas besoin d'une ligne carte). Les colonnes historiques `cash_sessions.closing_amount/expected_amount/discrepancy` restent alimentées **avec la ligne espèces uniquement**, pour ne pas casser l'affichage résumé existant (historique, badge POS).
- **`erp-app`** : `CashSessionCount` ajouté à `cash-session.model.ts` (`CashSession.counts?`), `CloseCashSessionPayload` changé pour `{counts, note?}`.
  - `cash-register-home` : `toggleCloseForm()` charge le détail de la session (`cashSessionService.get()`) + la liste de **tous** les moyens de paiement (`PaymentMethodService`, pas seulement ceux déjà utilisés — vérifier "tous les moyens" au sens propre), construit une ligne par moyen avec l'attendu pré-calculé (espèces = fond + ventes ; autres = ventes seules) et pré-rempli comme valeur par défaut du champ "compté" (le caissier ajuste seulement si ça diffère). Le tableau de fermeture remplace l'ancien champ unique "montant compté".
  - `cash-session-detail` : pour une session **fermée**, affiche désormais le tableau de réconciliation officiel (`session.counts` — attendu/compté/écart par moyen, ligne en rouge si écart ≠ 0) au lieu des totaux "en cours" ; pour une session encore **ouverte**, garde l'ancien affichage "Totaux par moyen de paiement (en cours)" calculé en direct depuis les paiements (pas encore de comptage officiel à ce stade).
- **Vérifié via `curl`** : fermeture sans ligne espèces → 422 correct ; fermeture avec espèces (150 fond + 9 vente = 159 attendu) et carte (9 vente, pas de fond = 9 attendu) → les deux lignes `cash_session_counts` créées avec le bon calcul, écarts à 0, `cash_sessions` résumé (espèces) correctement alimenté. Compilation Angular propre. Pas de test interactif navigateur (même limitation qu'au-dessus).

## Authentification (Sanctum, QR code + mot de passe) pour `erp-app` et `erp_validate_event` (2026-07-29)

Demandé initialement comme un système de code PIN à 4 chiffres, **révisé en cours de route** vers QR code + mot de passe (le fichier de migration `pin_code` créé avant la révision a été supprimé — colonne droppée manuellement en base puisque la migration avait déjà tourné, plus l'entrée correspondante retirée de la table `migrations`, même chirurgie que documentée plus haut dans ce fichier). Avant d'implémenter, question posée à l'utilisateur sur la portée : vraie auth backend (Sanctum, toutes les routes verrouillées) vs identification légère façon `ActiveCashierService` (API restée ouverte) — **choix : vraie auth Sanctum**, plus réutilisation du clavier visuel déjà construit pour `erp_validate_event`.

### Backend
- **Laravel Sanctum installé** (`composer require laravel/sanctum`, exécuté sur l'hôte — `erp-api` n'a pas de bind mount, un `composer require` dans le container serait perdu au prochain rebuild). Migration `personal_access_tokens` publiée via `vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"`. `User` gagne `HasApiTokens`.
- **Deux façons de se connecter**, dispatchées dans un seul endpoint `AuthController::login` selon le payload :
  - `{username, password}` → `Hash::check` classique.
  - `{barcode}` → recherche par `users.barcode`. **`barcode` est une colonne déjà présente dans `users` depuis le tout début du projet (`string(13)`, unique, nullable) mais jamais utilisée nulle part** — repris tel quel comme secret encodé dans le QR de connexion plutôt que d'ajouter une nouvelle colonne. `UserController::generateQrCode` (re)génère une valeur aléatoire unique (`Str::random(13)`, retry si collision) ; `UserController::qr` sert le PNG (`App\Support\Qr::png()`, même helper que les billets d'événement).
  - Les deux émettent un token Sanctum (`$user->createToken(...)->plainTextToken`) — **Bearer token, pas de cookie de session** : les deux apps front sont des SPA sur des origines différentes, pas besoin du mode "stateful" cookie de Sanctum.
- **Toutes les routes existantes déplacées derrière `Route::middleware('auth:sanctum')->group(...)`**, sauf deux exceptions volontaires documentées en commentaire dans `routes/api.php` :
  1. `POST auth/login` — évidemment public (sert à obtenir le premier token).
  2. `GET event-tickets/{event_ticket}/qr` — reste public. Raison : `event-dashboard.ts` l'utilise en `<img src="...">` brut dans une fenêtre d'impression, qui ne peut pas joindre d'en-tête `Authorization`. Contrairement au QR de connexion (`users/{user}/qr`, lui protégé — c'est un mot de passe), ce PNG ne fait que ré-encoder `validation_code`, une chaîne aléatoire déjà destinée à finir sur un billet physique/email — l'exposer sans auth n'ouvre rien de plus que ce que le billet imprimé expose déjà. **`users/{user}/qr` reste protégé** : c'est un vrai identifiant de connexion, il ne doit jamais être atteignable par une simple balise `<img>` non authentifiée — le front le récupère en `Blob` via `HttpClient` (donc avec le token, via l'intercepteur) puis `URL.createObjectURL()`, jamais en `<img src="{api}/...">` direct.
- **Piège rencontré et corrigé** : une requête non authentifiée sans en-tête `Accept: application/json` (typiquement un simple `curl` sans option particulière) plantait en **500** au lieu de 401. Cause : `ApplicationBuilder::withMiddleware()` enregistre par défaut `redirectGuestsTo(fn () => route('login'))`, et cette API n'a aucune route web nommée `login` (`routes/web.php` n'a qu'une page d'accueil) → `RouteNotFoundException` non catchée. Fix dans `bootstrap/app.php` : `$middleware->redirectGuestsTo(fn () => null)`, qui force un simple 401 JSON (déjà couvert par `shouldRenderJsonWhen` sur `api/*`) au lieu de tenter une redirection qui n'a pas de sens pour une API 100% JSON.
- **Vérifié via `curl`** de bout en bout : 401 sans token, 422 mauvais mot de passe, connexion mot de passe OK, connexion QR (génération + lookup par `barcode`) OK, `GET /auth/me`, `POST /auth/logout` puis token révoqué → 401 ensuite, et un tour de vérification sur les endpoints existants (`events`, `bookings`, `cash-sessions`, `products`, `clients`, `rooms`, `tickets`, `event-dates`, `event-tickets/validate`) pour confirmer qu'aucun n'a été cassé par le passage sous `auth:sanctum`.

### `erp-app`
- `core/models/auth.model.ts`, `core/auth.service.ts` (token + utilisateur courant en signals, persistés en `localStorage`), `core/auth.interceptor.ts` (attache `Authorization: Bearer` à tout appel vers `API_URL`, déconnecte + redirige vers `/login` sur un 401 reçu en cours de session), `core/auth.guard.ts` (posé sur la route racine `Shell` — un seul endroit protège toutes les pages ; si un token est stocké mais pas encore vérifié, ex. rechargement de page, valide via `/auth/me` avant de laisser passer, pour ne pas flasher l'app puis rediriger si le token a expiré côté serveur).
- **`/login`** (route top-level, hors `Shell`) : deux onglets. "Mot de passe" (inputs classiques, clavier physique présumé sur un poste admin) et "📷 QR code" (caméra + `jsQR`, **code de scan porté à l'identique** de `erp_validate_event/event-checkin.ts` — mêmes noms de méthodes `startScan`/`stopScan`/`scanFrame`). Classes `.scanner*` redéfinies localement dans `login.css` (pas globales dans `erp-app`, comme documenté plus haut pour `erp_validate_event`).
- **`shell.ts`** : le mock `currentUser` codé en dur ("Thomas / Administrateur") est remplacé par un `computed()` sur `authService.currentUser()`. Le user-chip de la sidebar devient un `<button>` qui déconnecte au clic (icône ⏻ révélée au survol).
- **`user-form`** : nouvelle section "QR code de connexion" (visible seulement en édition — il faut un id existant). Bouton "Générer/Régénérer le QR code" → `UserService.generateQrCode()` puis affichage du PNG récupéré en `Blob` (`UserService.getQrBlob()` + `URL.createObjectURL`, jamais `<img src="{api}/...">`, voir la note de sécurité ci-dessus) — `ngOnDestroy` révoque l'URL objet pour ne pas fuiter de mémoire.

### `erp_validate_event`
Même service/intercepteur/guard qu'`erp-app` (dupliqués, pas partagés — deux workspaces Angular séparés). Différence : c'est un kiosque tactile sans clavier physique.
- **`/login`** : scan QR **par défaut** (démarre la caméra dès l'arrivée sur la page, comme `event-checkin`), onglet "⌨️ Mot de passe" en repli pour un utilisateur qui n'a pas encore de QR généré. Le mode mot de passe réutilise le **clavier visuel AZERTY existant** (`KEYBOARD_ROWS`, classes `.kiosk-keyboard*`/`.pos-keypad__key` — mêmes largeurs de touches fixes que la correction appliquée plus tôt sur `event-checkin`), avec deux "champs" tapables (utilisateur/mot de passe, pas de vrai `<input>`) — taper une touche écrit dans le champ actuellement sélectionné (`activeField`).
- Guard posé sur `''` (EventSelect) et `check-in/:id` (EventCheckin) — les deux seules routes de l'app.
- **Vérifié** : compilation propre des deux apps (`docker logs`), backend vérifié exhaustivement via `curl` (ci-dessus). **Pas de test interactif en navigateur** (même limitation déjà signalée pour le dashboard et le fond de caisse — aucun outil Playwright/screenshot disponible dans cet environnement). Point d'attention à vérifier manuellement : le flux `getUserMedia` (permission caméra) sur un vrai appareil, et le comportement de l'intercepteur/guard en conditions réelles de navigation (redirections, expiration de token) — ces aspects ne sont vérifiables qu'en navigateur réel.

### Impression / export PDF du QR de connexion (2026-07-29, pas testée en navigateur)

Bouton "🖨️ Imprimer / Exporter en PDF" dans `user-form` (visible dès qu'un QR a été généré). **Pas de librairie PDF ajoutée** : réutilise le dialogue d'impression natif du navigateur (`window.print()`), où "Enregistrer en PDF" est déjà une destination disponible au même titre qu'une imprimante physique — évite une dépendance de plus pour un outil interne. Même pattern d'ouverture de fenêtre que `event-dashboard.ts::printTickets()` (fenêtre `window.open('', '_blank')` + `document.write` + attente du chargement de l'image avant `.print()`).

- **Piège évité** : le QR affiché dans le formulaire est chargé en `Blob` puis exposé via une URL `blob:` (`URL.createObjectURL`, nécessaire pour l'affichage inline puisque `/users/{id}/qr` est protégé par auth, voir plus haut). Réutiliser cette même URL `blob:` dans le `document.write` de la fenêtre d'impression n'était pas garanti fiable (contexte de document séparé). `loadQrImage()` convertit donc aussi le blob en **data URI** (`FileReader.readAsDataURL`) conservée à part, uniquement pour l'impression — l'URL `blob:` reste utilisée pour l'aperçu inline (révoquée dans `ngOnDestroy`), la data URI pour la fenêtre d'impression.
- **Vérifié uniquement par compilation** (`docker logs erp_v2_app`, chunk `user-form` régénéré sans erreur) — pas de test navigateur, conformément à la consigne.

### Confirmation avant régénération du QR + envoi par email (2026-07-29, pas testée en navigateur)

- **Modal de confirmation** (`.modal-overlay`/`.modal-panel`, même pattern que partout ailleurs dans l'app — pas de `confirm()` natif) avant de régénérer un QR déjà existant : `requestGenerateQrCode()` ouvre la modal si `barcode()` est déjà rempli, sinon génère directement (rien à invalider pour une toute première génération, pas la peine de confirmer).
- **Envoi par email** : nouveau `Mail\UserQrCodeMail` + vue `emails/user-qr-code.blade.php` (même pattern que `EventTicketsMail` — QR en data URI base64, pas `ShouldQueue` puisqu'aucun worker de queue n'est déployé). `UserController::sendQrEmail` rejette en 422 si aucun QR n'a encore été généré. Bouton "✉️ Envoyer par email" dans `user-form`, visible uniquement si un QR existe déjà.
- **Bug préexistant découvert et corrigé en cours de route** (sans rapport avec cette tâche, mais bloquait tout le backend) : le conteneur `erp_v2_api` est parti en crash-loop pendant cette session — `AdminUserSeeder` matchait l'admin par `email`, or l'email réel en base (`thomsvdl@gmail.com`, changé à un moment antérieur de la session pour recevoir de vrais emails de test) avait divergé de `ADMIN_EMAIL` dans `.env` (`admin@erp.local`). À chaque redémarrage, `firstOrCreate(['email' => ...])` ne trouvait plus la ligne existante et retentait un `insert` qui entrait en collision avec la contrainte unique sur `username`. **Fix** : `AdminUserSeeder` matche désormais sur `username` (identifiant stable) plutôt que `email`, pour ne plus jamais planter sur ce genre de dérive.
- **Vérifié via `curl`** : rejet 422 propre si aucun QR n'existe encore (pas d'email tenté), route bien enregistrée (405 sur mauvais verbe). **L'envoi réel n'a volontairement pas été déclenché** — `MAIL_MAILER=smtp` pointe vers un vrai compte Gmail (voir `.env`), un envoi de test aurait réellement expédié un email, ce qui sort du cadre de "ne pas tester". Compilation Angular propre.

### Bouton déconnexion dans `erp_validate_event` (2026-07-30)

Cette app n'a pas de shell/nav persistant comme `erp-app` (chaque page est autonome) — bouton "⏻ Déconnexion" ajouté séparément sur les deux seules pages de l'app : `event-select` (coin haut-droit, au-dessus du header centré existant) et `event-checkin` (dans `.kiosk-header`, à côté du sélecteur Scanner/Clavier). Les deux appellent `AuthService.logout()` puis redirigent vers `/login` que l'appel réseau réussisse ou échoue (même pattern que `erp-app/shell.ts`). Sur `event-checkin`, `logout()` arrête aussi le scan caméra en cours (`stopScan()`) avant de rediriger, pour ne pas laisser la caméra allumée en arrière-plan. Vérifié par compilation uniquement (`docker logs erp_v2_validate_event`, chunks `event-select`/`event-checkin` régénérés sans erreur) — pas de test navigateur.

### Expiration des tokens Sanctum — 12h (2026-07-30)

Suite à une discussion sur les pistes d'amélioration post-implémentation de l'auth : les tokens Sanctum n'expiraient jamais (`config('sanctum.expiration') === null` par défaut). Fixé à **720 minutes (12h)** — couvre une journée de travail ou un événement complet sans déconnexion forcée en plein service, tout en bornant l'exposition d'un token qui fuiterait (appareil volé, capture d'écran du QR de connexion) à une demi-journée max plutôt qu'indéfiniment. Configurable via `SANCTUM_EXPIRATION` en `.env` si besoin d'ajuster sans redéployer de code.

- **Changement minimal** : une seule ligne dans `config/sanctum.php` (`'expiration' => env('SANCTUM_EXPIRATION', 720)`). Pas besoin de toucher `AuthController::respondWithToken` — contrairement à ce qu'on pourrait penser, `HasApiTokens::createToken()` ne lit PAS cette config pour poser `expires_at` sur le token ; c'est `Laravel\Sanctum\Guard` (résolu par `SanctumServiceProvider`) qui applique la fenêtre glissante à **chaque requête authentifiée**, en comparant `token.created_at` à `now() - expiration minutes` — donc ça s'applique automatiquement à tous les tokens, y compris ceux déjà émis avant ce changement.
- **Vérifié via `curl`** : token frais → 200 ; même token après recul artificiel de `created_at` de 13h en base (`UPDATE personal_access_tokens SET created_at = ...`) → 401. Confirme que la fenêtre de 12h est bien appliquée dynamiquement, pas seulement à la création.

## Suite de tests PHPUnit (2026-07-30)

Demandé après une discussion sur les pistes d'amélioration ("zéro test automatisé" était en tête de liste). **36 tests Feature, 102 assertions**, tous verts, couvrant la logique métier la plus sensible construite cette session — pas de couverture exhaustive de tous les CRUD simples (peu de valeur), priorité aux flux à conséquences réelles (argent, capacité, accès).

- `tests/Feature/AuthTest.php` (10) : rejet 401 sans token (+ régression du bug 500 documenté plus haut, testé explicitement en requête sans `Accept: application/json`), login mot de passe/QR (succès + échec), `/auth/me`, logout + révocation du token, **expiration à 12h** vérifiée avec `$this->travel()` (Carbon testing helper — recule/avance le temps sans vraiment attendre) à 11h (encore valide) et 13h (expiré).
- `tests/Feature/BookingTest.php` (4) : création, validation du `type` (`in:breakfast,lunch,dinner`), filtre par date, passage à `validated_at`.
- `tests/Feature/CashSessionTest.php` (7) : `active` renvoie `[]` (pas de session), ouverture, rejet du doublon, fermeture sans espèces rejetée, **réconciliation multi-moyens** (espèces = fond + ventes, carte = ventes seules, vérifié avec de vraies ventes créées via `POST /tickets`), écart non nul détecté, double-fermeture rejetée.
- `tests/Feature/EventTicketTest.php` (8) : vente par lot (`quantity`), limite de places (rejet au-delà, autorisé pile à la limite), validation par code (+ insensible à la casse, + double-validation rejetée), et confirmation que `event-tickets/{id}/qr` reste **public** (exception documentée dans `routes/api.php`).
- `tests/Feature/UserQrCodeTest.php` (7) : génération/régénération du `barcode`, PNG du QR (200 une fois généré, 404 avant), **`users/{id}/qr` reste protégé** (contrairement au QR de billet — c'est un mot de passe), envoi par email rejeté sans QR généré, envoi par email réel testé via `Mail::fake()` + `Mail::assertSent(UserQrCodeMail::class, ...)` — **aucun email réel envoyé** (`MAIL_MAILER=array` dans `phpunit.xml`, indépendant du `MAIL_MAILER=smtp` réel de `.env`).

### Pièges rencontrés en écrivant ces tests
- **`RequestGuard` mémorise l'utilisateur résolu** pour la durée de vie de l'instance (`Illuminate\Auth\RequestGuard`) — dans un test qui enchaîne logout puis une 2ᵉ requête authentifiée avec le même token révoqué, la 2ᵉ requête réutilisait le résultat (positif) de la 1ʳᵉ au lieu de re-vérifier le token en base. Fix : `auth()->forgetGuards();` entre les deux appels HTTP du même test.
- **`Sanctum::actingAs()` court-circuite complètement la vérification de token** — un test qui veut vérifier qu'un token invalide/absent est bien rejeté (401) ne doit **pas** avoir `Sanctum::actingAs()` déjà appelé ailleurs dans le même test (ex. un `setUp()` global), sinon le guard renvoie l'utilisateur "acté" quel que soit l'en-tête `Authorization` envoyé. D'où le choix de ne **pas** mettre `Sanctum::actingAs()` dans `setUp()` de `UserQrCodeTest`, mais explicitement dans chaque test qui en a besoin, pour garder le test `test_qr_routes_require_authentication` valide.

### Nettoyage
Les tests d'exemple par défaut du squelette Laravel (`tests/Feature/ExampleTest.php`, cassé sans `APP_KEY` — non pertinent pour une API 100% JSON — et `tests/Unit/ExampleTest.php`, trivial) ont été supprimés.

### Comment lancer les tests
`php artisan test` (ou `./vendor/bin/phpunit`) **sur l'hôte**, pas dans le container Docker : l'image `erp-api` est buildée avec `composer install --no-dev`, PHPUnit n'y est donc pas installé (comportement voulu — une image de prod n'embarque pas les dépendances de test). `phpunit.xml` bascule automatiquement sur SQLite en mémoire (`DB_CONNECTION=sqlite`, `:memory:`) et `MAIL_MAILER=array`, donc aucune dépendance à MySQL/Gmail réels pour faire tourner la suite — vérifié que `pdo_sqlite`/`sqlite3` sont disponibles à la fois sur l'hôte et dans le container (PHP les embarque par défaut).

### Filtre par jour + tri sur l'historique des sessions dans `/caisse` (2026-07-30, pas testée en navigateur)

`cash-register-home` : le tableau "Historique des sessions" gagne un filtre par jour (`app-date-picker`, même pattern que `booking-list`/`event-date-select` — filtré **côté client**, pas de paramètre date côté `CashSessionService.list()`, la liste tient facilement en mémoire) et un tri cliquable sur chaque colonne (utilisateur, ouverture, fermeture, fond initial, fond compté, écart — même pattern `sortField`/`sortDir`/`toggleSort`/`sortIndicator` que partout ailleurs dans l'app). Tri par défaut : ouverture la plus récente d'abord (`desc`), plus utile pour un historique que l'ordre croissant. Vérifié uniquement par compilation (`docker logs erp_v2_app`, chunk `cash-register-home` régénéré sans erreur) — pas de test navigateur, conformément à la consigne.

### Repositionnement des filtres + filtre par utilisateur (2026-07-30, pas testée en navigateur)

Signalé juste après : le filtre par jour, placé dans `.card-header` (qui a `justify-content: space-between`), se retrouvait collé tout à droite d'une carte pleine largeur — visuellement décroché du titre "Historique des sessions". Déplacé dans `.card-body`, au-dessus du tableau, dans une rangée de filtres dédiée (`.field` + `app-date-picker`/`<select>`, même disposition que les filtres de `product-list`) plutôt que dans l'en-tête. Ajout au passage d'un filtre par utilisateur (`<select>` peuplé par `users()`, déjà chargé pour le sélecteur de caissier) combiné au filtre par jour dans le même `computed filteredSessions`, plus un bouton "Réinitialiser" qui n'apparaît que si au moins un filtre est actif. Vérifié uniquement par compilation.

### `<select>` restylé globalement dans `erp-app` (2026-07-30, pas testée en navigateur)

Les listes déroulantes natives gardaient le rendu du navigateur/OS (flèche, apparence) par défaut, détonnant à côté des `.input`/`.btn` déjà stylés — `.select` ne faisait que reprendre le padding/bordure de `.input`, sans toucher `appearance`.

- `appearance: none` (+ préfixes `-webkit-`/`-moz-`) pour enlever le rendu natif du contrôle fermé, chevron redessiné en `background-image` (SVG en data-URI, pas un `::after`, dont le support sur `<select>` est incohérent selon les navigateurs). Le **panneau déroulant ouvert reste natif** (liste d'options) — impossible à styliser en CSS pur, seul le contrôle fermé peut être repris.
- Couleur du chevron alignée sur `--text-secondary`, mais figée en dur dans le SVG (une data-URI ne peut pas référencer une variable CSS) — donc **deux variantes déclarées** (gris clair `#7c7b76` / gris foncé `#9a9b9f`) et resélectionnées via le même double-gating déjà utilisé pour le thème ailleurs dans ce fichier (`@media (prefers-color-scheme: dark)` pour le thème système + `:root[data-theme='dark'|'light']` pour la bascule explicite de `shell.ts`, cette dernière prioritaire).
- Ajouts mineurs : `cursor: pointer`, `:hover` (bordure teintée primaire, cohérent avec `.input:focus`), `:disabled` (opacité réduite — n'existait pour aucun champ de formulaire jusqu'ici, seulement pour `.btn`).
- Aucun changement dans `erp_validate_event` : cette app n'utilise aucun `<select>` (kiosque tactile, claviers/pickers custom uniquement).
- Vérifié uniquement par compilation (`docker logs erp_v2_app`, `styles.css` régénéré sans erreur) — pas de test navigateur, conformément à la consigne.

### Calendrier `erp_validate_event` : affiche aussi le passé, en discret (2026-07-30, pas testée en navigateur)

Assoupli la règle "n'affiche pas les événements passés" posée plus tôt dans le projet — elle ne s'applique désormais **qu'à la vue Liste**. Le calendrier montre toutes les occurrences, passées comprises, avec un style discret pour celles déjà passées.

- `event-select.ts` : le signal brut renommé `allDates` (toutes les occurrences, sans filtre) ; nouveau `computed upcomingDates` (filtré, non-passé) consommé uniquement par la vue Liste. `datesByDay`/`calendarCells` (donc le calendrier) restent branchés sur `allDates`, donc voient tout. Nouvelle méthode `isPast(eventDate)`.
- `event-select.html` : le message vide ("Aucune occurrence à venir") ne s'affiche plus que si la vue Liste est active et `upcomingDates()` est vide — le calendrier reste affiché même sans occurrence à venir (il peut légitimement avoir du passé à montrer). Chaque `.calendar-event` gagne `[class.calendar-event--past]`.
- `event-select.css` : `.calendar-event--past` reprend les couleurs neutres (`--color-neutral-bg`/`--color-neutral-text`, déjà utilisées pour les badges neutres) + `opacity: 0.6` (0.85 au survol) — reste cliquable (consulter une occurrence passée reste possible), juste discret visuellement.
- Vérifié uniquement par compilation (`docker logs erp_v2_validate_event`, chunk `event-select` régénéré sans erreur) — pas de test navigateur, conformément à la consigne.

### Bascule thème clair/sombre dans `erp_validate_event` (2026-07-30, pas testée en navigateur)

Le CSS du thème sombre existait déjà dans `styles.css` (commentaire déjà présent : "pour un futur bouton de bascule") mais rien ne l'activait dans cette app — seul `erp-app` avait le bouton (dans `shell.ts`). Contrairement au bouton déconnexion (ajouté séparément sur `event-select`/`event-checkin` faute de shell), cette app a un composant racine `App` (`app.ts`/`app.html`) qui enveloppe tout via `<router-outlet>` — un seul bouton là suffit à couvrir les 3 écrans (login compris).

- `core/theme.service.ts` (nouveau) : même logique que `erp-app/layout/shell/shell.ts` (`isDark` signal, `toggleTheme()`, lecture initiale depuis `localStorage['erp-v2-theme']` sinon `prefers-color-scheme`) — dupliquée plutôt que partagée (deux workspaces Angular séparés), mais extraite en service ici plutôt que laissée dans un composant de page puisqu'il n'y a justement pas de composant de page unique qui couvre tout.
- Bouton rond flottant (`position: fixed`) en **haut à gauche** — le haut-droit est déjà pris par le bouton "Déconnexion" par page.
- Vérifié uniquement par compilation (`docker logs erp_v2_validate_event`) — pas de test navigateur, conformément à la consigne.

### Correction : déconnexion + thème seulement sur `event-select`, pas `check-in` (2026-07-30)

Revu juste après : les deux boutons ne doivent pas apparaître sur `event-checkin`, seulement sur la première page (`event-select`).
- Bouton thème retiré du composant racine `App` (`app.ts`/`app.html`/`app.css` revenus à un simple `<router-outlet>`) — n'est donc plus visible sur `/login` non plus, volontairement, plus global.
- Bouton déconnexion + bouton thème ajoutés côte à côte sur `event-select` (`ThemeService` injecté directement là, `logout()` déjà présent). `event-checkin` perd son bouton déconnexion et les imports/injections `AuthService`/`Router` devenus inutiles (nettoyés, plus de code mort).
- `ThemeService` (`core/theme.service.ts`) conservé tel quel — seul son point d'utilisation change.
- Vérifié par compilation (`docker logs erp_v2_validate_event`, `event-select`/`event-checkin` régénérés sans erreur).

## POS Restaurant — sélection de table + commande multi-sections (2026-07-29/30)

Demandé (portée volontairement limitée aux 4 premières étapes du spec Readme.md — paiement et impression/email restent pour plus tard) :
1. Plan de salle avec sélecteur de salle (type restaurant uniquement) + ouvrir une table avec le nombre de personnes.
2. Afficher le POS une fois la table ouverte pour sélectionner des produits.
3. Séparer les produits en sections, pouvoir ajouter des sections.
4. Une fois les produits sélectionnés, pouvoir revenir à la sélection des tables (la table reste ouverte).

**Découverte avant d'implémenter** : le backend avait déjà `Order`/`OrderSection`/`OrderLine` (modèles + migrations) scaffoldés depuis une session précédente — visibles via le commentaire de `TicketController` ("Vente directe : encaisse immédiatement, pas de flux Order/cuisine"). **Aucun contrôleur ni route** n'existait encore pour ces modèles — construits maintenant plutôt que recréé de zéro.

### Backend
- Migration : `orders.number_of_guests` (nullable en base, requis à la validation) — n'existait ni sur `orders` ni sur `tables` (qui n'a aucune notion de capacité physique dans ce schéma).
- **Une table occupée = une `Order` existe pour son `table_id`** — pas de colonne `closed`/`paid` pour l'instant (le paiement, hors scope ici, s'en chargera plus tard). `OrderController::store` rejette (422) l'ouverture d'une table déjà occupée, et crée automatiquement sa première section ("Section 1") pour que l'écran de commande ait toujours au moins une section à afficher.
- `OrderSectionController::store` auto-nomme "Section N" si aucun nom fourni (compte les sections existantes + 1) ; `::destroy` refuse de supprimer la **dernière** section d'une commande (422) — une commande sans section n'a nulle part où accrocher un produit.
- `OrderLineController::store` **incrémente la quantité** si le produit est déjà présent dans la section au lieu de dupliquer la ligne (même logique que le panier de `pos-vente` côté front).
- `OrderController::destroy` annule la commande et libère la table (cascade DB déjà en place sur `order_sections`/`order_lines`).
- Routes (`GET|POST orders`, `GET|DELETE orders/{order}`, `POST orders/{order}/sections`, `DELETE order-sections/{order_section}`, `POST order-sections/{order_section}/lines`, `PUT|DELETE order-lines/{order_line}`), toutes derrière `auth:sanctum`.
- **Vérifié via `curl`** de bout en bout : ouverture d'une table (avec création auto de Section 1) → rejet du doublon (table déjà ouverte) → ajout d'un produit ×2 puis re-ajout (incrémente à 3, ne duplique pas) → ajout d'une 2ᵉ section → suppression de la 1ʳᵉ section (OK, il en reste une) → suppression de la dernière section restante (422 correct) → annulation de la commande (libère la table). Un 2ᵉ passage complet avec un vrai produit du catalogue actif restaurant confirmé également.

### `erp-app`
- `core/models/order.model.ts`, `core/order.service.ts`, `core/order-section.service.ts`, `core/order-line.service.ts`.
- **`pages/pos-restaurant/table-select`** (route `/pos-restaurant`, déjà liée dans la nav depuis le début du projet mais menait nulle part jusqu'ici) : sélecteur de salle en pastilles (`rooms().filter(type === 'restaurant')`, première salle sélectionnée par défaut), plan de salle en **lecture seule** réutilisant le pattern `.checkin-canvas`/`.checkin-table`/`.legend-dot*` déjà dupliqué ailleurs dans le projet (`event-dashboard.css`, `erp_validate_event/event-checkin.css`) plutôt que le mode édition drag/resize de `floor-plan-editor`. Clic sur une table libre → modal "nombre de personnes" → ouvre la commande ; clic sur une table occupée → rejoint directement sa commande en cours.
- **`pages/pos-restaurant/order-builder`** (route `/pos-restaurant/:orderId`) : réutilise le pattern produits/catégories/recherche de `pos-vente` (`.pos-layout`/`.pos-products`/`.pos-grid`/`.pos-product-card`, classes déjà globales) filtré sur `ProductCatalog.active_restaurant` (pas `active_direct_sale`) — même mécanisme "un catalogue actif à la fois par contexte POS" déjà en place côté backend (`activateForRestaurant`). Sections affichées en pastilles cliquables (`tab-group`) avec une section "active" qui reçoit les produits tapés ; bouton "+ Section" et ✕ par section (masqué s'il n'en reste qu'une, cohérent avec le refus du backend). Chaque action (ajout produit/section, +/− quantité, suppression) republie immédiatement au backend puis recharge toute la commande — pas de brouillon local, cohérent avec le reste de l'app. "← Retour aux tables" ramène à `table-select` **sans fermer la commande** (elle reste "occupée") ; "Annuler la commande" (nouveau, pas demandé explicitement mais nécessaire — sans lui, une table ouverte par erreur resterait bloquée occupée indéfiniment) supprime la commande et libère la table.
- **Piège CSS rencontré** : le premier commentaire CSS écrit dans `order-builder.css` contenait littéralement `card*/.pos-cart*` — la séquence `*/` a fermé le commentaire en plein milieu, cassant le fichier (`Unexpected "*"`, `Unterminated string token`). Reformulé pour ne plus jamais faire suivre un `*` d'un `/` dans un commentaire CSS.
- **Vérifié via `curl`** (backend ci-dessus) + compilation Angular propre (`docker logs erp_v2_app`, chunks `table-select`/`order-builder` régénérés sans erreur). **Pas de test interactif en navigateur** (même limitation que le reste de cette session — pas d'outil Playwright/screenshot disponible).
- **Hors scope, pour une prochaine étape** (Readme.md steps 5-6, non demandés cette fois) : paiement (espèces + Bancontact partagés, rendu en espèces affiché), conversion de l'`Order` en `Ticket` payé, impression du ticket de caisse, envoi par email si un client est sélectionné.

### Pages `/pos-restaurant` sans overflow (2026-07-30)

Même traitement que `/pos-vente` en son temps : `shell.ts` avait `FIXED_LAYOUT_ROUTES = ['/pos-vente']`, comparé par **égalité stricte** à `router.url` — ne matchait donc jamais `/pos-restaurant` ni `/pos-restaurant/{orderId}` (route enfant dynamique). Comparaison changée pour un préfixe (`isFixedLayoutUrl()`, `url === route || url.startsWith(route + '/')`), et `/pos-restaurant` ajouté à la liste.

- `order-builder` réutilise déjà la structure `.pos-layout` de `pos-vente` (déjà pensée pour ce mode plein-écran, `flex:1`/`min-height:0` en cascade) — fonctionne sans changement CSS supplémentaire.
- `table-select` needed un ajustement : son plan de salle (`.checkin-canvas`) avait une hauteur fixe (`60vh`), pensée pour une page qui scrolle normalement (comme `event-dashboard`, d'où vient ce CSS dupliqué). En mode plein-écran, une hauteur figée peut soit déborder sur un petit écran, soit laisser du vide. Remplacé par `.table-select__card`/`.table-select__card-body` en `flex:1; min-height:0` en cascade jusqu'au canvas (`flex:1; min-height:320px; overflow:auto` — scrolle en interne si le plan dépasse plutôt que de déborder sur la page).
- Vérifié uniquement par compilation (`docker logs erp_v2_app`, chunks `shell`/`table-select` régénérés sans erreur) — pas de test navigateur.

### Bug de fond corrigé : `.pos-grid`/`.pos-cart__body` ne scrollaient pas réellement (2026-07-30)

Signalé après coup ("il faut pouvoir faire défiler le card s'il y a trop de produits") : le `overflow-x: auto` ajouté précédemment sur `.pos-cart__body` ne réglait pas le vrai problème. Les deux zones censées scroller en interne (`.pos-grid`, la grille de produits, et `.pos-cart__body`, la liste de lignes du panier/section) avaient `overflow-y: auto` **mais pas `flex: 1`**. Sans `flex-grow`, un enfant flex ne se laisse pas borner par l'espace restant du parent (il garde `flex-grow: 0` par défaut, donc grandit avec son propre contenu) — `overflow-y: auto` ne se déclenche que si l'élément est effectivement plus petit que son contenu, ce qui n'arrivait jamais ici : c'est le parent (`.pos-products`/`.pos-cart`, puis `.app-main`) qui débordait à la place.

- Fix : `flex: 1;` ajouté sur `.pos-grid` et `.pos-cart__body` (styles.css, classes globales) — les deux scrollent désormais réellement en interne dès que leur contenu dépasse l'espace disponible, sur `pos-vente` **et** `order-builder` (classes partagées par les deux pages).
- Bug latent probablement présent depuis la mise en place initiale de `pos-vente` — jamais surpris faute d'avoir testé avec assez de produits/lignes pour dépasser la hauteur visible en navigateur.
- Vérifié uniquement par compilation (`docker logs erp_v2_app`, `styles.css` régénéré sans erreur) — pas de test navigateur.

### Règles sur les sections POS Restaurant (2026-07-30)

Deux garde-fous ajoutés sur `OrderSectionController` (source de vérité backend) + reflétés côté front pour désactiver les actions plutôt que d'attendre une erreur serveur :
- **Suppression** : refuse (422) si la section contient encore des lignes ("Vide la section avant de la supprimer"), en plus du garde-fou déjà existant sur la dernière section restante. `canRemoveSection(section)` côté front (longueur > 1 **et** section vide) contrôle l'affichage du ✕ sur chaque pastille de section.
- **Ajout** : refuse (422) si la **dernière** section de la commande (`order->sections()->latest('id')->first()`) n'a encore aucune ligne — évite d'empiler des sections vides jamais remplies. `canAddSection()` côté front désactive le bouton "+ Section" dans ce cas (avec un `title` expliquant pourquoi).
- **Vérifié via `curl`** de bout en bout : ajout d'une 2ᵉ section refusé tant que la 1ʳᵉ est vide → accepté après ajout d'un produit → suppression de la section non-vide refusée → suppression d'une section vide non-dernière acceptée. Compilation Angular propre (`docker logs erp_v2_app`, chunk `order-builder` régénéré sans erreur) — pas de test navigateur.

### Vraie cause de l'overflow POS Restaurant/Vente directe (2026-07-30)

Le `flex:1` ajouté précédemment sur `.pos-grid`/`.pos-cart__body` ne suffisait pas — l'overflow persistait avec beaucoup de produits. **Cause racine, un cran plus haut** : `.pos-layout` est un conteneur `display:grid` sans `grid-template-rows` défini. Une ligne de grille implicite (`auto`, comportement par défaut) se dimensionne **toujours sur son contenu**, quelle que soit la hauteur bornée du conteneur — contrairement à `flex-grow` en flexbox, CSS Grid ne redistribue pas automatiquement une hauteur définie de conteneur vers ses lignes implicites. Résultat : même avec toute la chaîne `flex:1`/`min-height:0` correctement posée plus bas (`.pos-products`, `.pos-cart`, `.pos-grid`, `.pos-cart__body`), la ligne de grille elle-même grandissait pour englober tout le contenu, et c'est `.pos-layout` (puis `.app-main`) qui débordait.

- Fix : `grid-template-rows: minmax(0, 1fr);` ajouté sur `.pos-layout` — force la ligne unique à occuper l'espace réellement disponible (avec un minimum de 0, pas la hauteur du contenu), ce qui laisse enfin `.pos-grid`/`.pos-cart__body` scroller en interne comme prévu.
- Piège CSS général à retenir pour ce projet : dans une grille imbriquée dans un contexte "hauteur bornée + scroll interne" (comme `.app-main--fixed`), il ne suffit pas de mettre `min-height:0`/`overflow:auto` sur les éléments profonds — il faut aussi explicitement border les **lignes de la grille elle-même** (`grid-template-rows: minmax(0, 1fr)` ou équivalent), sans quoi le comportement par défaut `auto` propage silencieusement la taille du contenu vers le haut de la chaîne.
- Vérifié uniquement par compilation (`docker logs erp_v2_app`) — pas de test navigateur, conformément à la consigne des messages précédents sur ce sujet.

### 3ᵉ tentative sur l'overflow POS — restructuration en `.pos-page` (2026-07-30)

Testé en vrai navigateur cette fois (pas de "ne pas tester" sur ce message) : toujours cassé malgré le fix `grid-template-rows: minmax(0, 1fr)` précédent, dont le raisonnement CSS était pourtant correct. Plutôt que de continuer à corriger la même chaîne flex/grid existante par petites touches, restructuration plus explicite :

- Nouveau `.pos-page` : unique enfant flex de `.app-main--fixed` (`flex:1; min-height:0`, cas standard flex-item), qui définit lui-même **explicitement** 2 lignes de grille (`grid-template-rows: auto 1fr` — auto pour `.app-topbar`, 1fr pour le reste). Une ligne `1fr` sur un `grid-template-rows` **explicite** se dimensionne fiablement sur l'espace disponible ; c'est spécifiquement une ligne **implicite** `auto` (ce que `.pos-layout` était pour `.app-main--fixed` avant ce changement) qui pose problème en se dimensionnant sur le contenu.
- `.pos-layout` n'est plus un enfant flex direct de `.app-main--fixed` mais un enfant grid de `.pos-page` (dans sa ligne `1fr`) — `flex:1` retiré (n'a plus de sens, ce n'est plus un item flex), garde `min-height:0` et sa propre grille imbriquée (colonnes produits/panier) inchangée.
- `pos-vente.html` et `order-builder.html` enveloppent désormais tout leur contenu (topbar + zone produits/panier, modal de paiement exclue chez `pos-vente` car `position:fixed`, s'en moque) dans `<div class="pos-page">`.
- **Bouton "💳 Paiement"** ajouté dans `order-builder` (pied du panier, sous le total) — **volontairement sans `(click)`, ne fait rien pour l'instant** (stub explicitement demandé, en attendant l'implémentation du paiement — steps 5-6 du spec Readme.md POS Restaurant, toujours hors scope). Désactivé si le total est à 0.
- Vérifié par compilation uniquement (`docker logs erp_v2_app`, chunks `pos-vente`/`order-builder` régénérés sans erreur) — la vérification visuelle réelle reste à faire par l'utilisateur, aucun outil de test navigateur disponible ici.

### 4ᵉ tentative, cette fois avec une vraie capture d'écran — CSS Grid abandonné pour flexbox pur (2026-07-30)

Toujours cassé après la restructuration `.pos-page`. L'utilisateur a fourni une **capture d'écran réelle (Safari)** : le panneau "Sections" déborde nettement en bas, au point que le total et le bouton Paiement ne sont même plus visibles — confirme que `.pos-cart__body` ne scrolle pas du tout, il grandit avec son contenu.

- **Piste retenue** : Safari/WebKit a des bugs documentés sur `minmax(0, 1fr)` dans des grilles CSS imbriquées combinées à `min-height:0` — exactement la technique utilisée dans les 2 tentatives précédentes (`.pos-layout`/`.pos-page` en `display:grid`). Le raisonnement CSS était correct en théorie (et fonctionnerait probablement sous Chrome/Firefox) mais WebKit ne le respecte pas de façon fiable dans ce cas précis.
- **Fix** : toute la chaîne verticale critique (`.pos-page` → `.pos-layout` → `.pos-products`/`.pos-cart`) repassée en **flexbox pur** (`display:flex`, plus aucun `display:grid` sur cet axe) — `flex:1`/`min-height:0` en cascade à chaque niveau, `.pos-cart` devient `flex: 0 0 400px` (remplace l'ancienne colonne de grille fixe). Seul `.pos-grid` reste `display:grid` (légitime : c'est lui-même la zone de scroll final pour les cartes produit, pas un ancêtre d'un autre scrollable — pas concerné par le bug WebKit ci-dessus). Flexbox est le pattern le plus éprouvé cross-navigateur pour "colonnes avec scroll interne" (utilisé par la quasi-totalité des apps web de ce type), plus fiable que CSS Grid pour cet usage précis.
- Media query `@media (max-width: 960px)` mise à jour en cohérence (`flex-direction: column` au lieu de `grid-template-columns: 1fr`).
- **Vérifié** : CSS compilé confirmé propre (`docker logs erp_v2_app`) **et** confirmé réellement servi par le serveur de dev via `curl http://localhost:19002/styles.css` (pour écarter tout doute de cache/build après 3 échecs successifs) — la règle `.pos-cart { flex: 0 0 400px; ... }` est bien celle qui sera chargée par le navigateur. Vérification visuelle définitive toujours à faire par l'utilisateur (Safari, éventuellement Chromium en comparaison).

### 5ᵉ tentative — `flex:1` remplacé par `max-height` calculé, vérifié empiriquement au Playwright (2026-07-30)

Le flexbox pur (tentative précédente) n'a toujours pas suffi. L'utilisateur a directement diagnostiqué la piste et donné l'instruction précise : retirer `flex: 1` de `.pos-cart__body` et le remplacer par un `max-height`. Raisonnement a posteriori : `flex: 1` ne borne pas activement une hauteur, il ne fait que réclamer l'espace libre du parent — si un ancêtre plus haut dans la chaîne ne redistribue pas correctement cette hauteur (ce qui semble être le cas ici, cohérent avec le comportement erratique observé sous WebKit dans les tentatives précédentes), `.pos-cart__body` se contente de grandir avec son contenu. Un `max-height` explicite borne l'élément indépendamment du comportement du parent — plus robuste, quitte à être moins "élégant" en pur flexbox.

- Un outil Playwright déjà présent dans le scratchpad de session (Chromium réel installé, scripts de test déjà écrits pour ce projet lors d'une session précédente) a permis de **mesurer empiriquement** la géométrie réelle plutôt que de deviner : connexion UI → `/pos-restaurant` → ouverture/réutilisation d'une table → mesure `getBoundingClientRect()`/`getComputedStyle()` de chaque élément de la chaîne, à vide puis après ajout de ~15 produits pour forcer le débordement.
- Mesures à vide (avant tout clic, sans artefact de scroll-into-view) : `.pos-cart__body` commence à `top:233px` (padding `.app-main` 32px + topbar 56px + gap 24px + `card-header` 63px + `tab-group` sections 34px + marges), `.card-footer` fait `149px` de haut, padding vertical de `.app-main` confirmé à `32px` haut/bas via `getComputedStyle`.
- Fix appliqué (styles.css, classes globales, communes à `pos-vente` et `order-builder`) :
  ```css
  .pos-grid { max-height: calc(100vh - 340px); /* + flex:1 retiré, reste inchangé */ }
  .pos-cart__body { max-height: calc(100vh - 450px); /* + flex:1 retiré, reste inchangé */ }
  ```
  Les deux valeurs incluent une marge de sécurité au-delà du minimum mesuré, pour tolérer un retour à la ligne de la rangée d'onglets de sections (beaucoup de sections) ou une légère variation de hauteur de topbar.
- **Vérifié empiriquement au Playwright/Chromium réel** (pas seulement compilation) : après avoir cliqué sur 15 produits différents pour remplir `.pos-cart__body` bien au-delà de sa hauteur naturelle, mesure finale : `docScrollHeight`/`bodyScrollHeight` = `900px` = `viewportHeight` exactement (**zéro débordement de page**), `.pos-cart__body` capé à `450px` pile (= `calc(100vh - 450px)` pour un viewport de 900px), `.card-footer` (total + bouton Paiement) intégralement visible entre `683px` et `832px` — bien dans les 900px du viewport. Capture d'écran (`shots/order-builder-overflow.png`) confirmée visuellement : 8 lignes de produits affichées dans la section, total "448.00 €" et bouton "💳 Paiement" pleinement visibles et non coupés, aucun signe de débordement.
- **Nuance** : cette vérification a eu lieu sous Chromium (Playwright), pas directement dans le Safari réel de l'utilisateur où les échecs précédents avaient été constatés — reste à confirmer par un test réel en navigateur, même si le passage à un `max-height` explicite en `calc()` élimine la dépendance aux subtilités de redistribution flex/grid qui semblaient être en cause sous WebKit.

## Kitchen display + workflow cuisine (`erp_kitchen_display`, Reverb, sections/commandes) (2026-07-30)

Nouvelle app (voir Readme.md : "on va créer une app erp_ditchen_display pour afficher les commandes à préparer en cuisine, synchronisée (Laravel Echo) avec l'app et le kitchen display") + workflow de section/commande côté POS - Restaurant.

**Découverte avant d'implémenter** : le backend avait déjà bien plus de scaffolding que prévu — `Station` (modèle + migration + `StationController` + CRUD complet côté `erp-app/parametres/stations`, y compris le sélecteur de station sur le formulaire produit), `Passe` (modèle `belongsTo(Station)`, migration, mais **aucun** contrôleur/route/UI), et surtout `orders.state` avec un commentaire de migration déjà confirmé par l'utilisateur lors d'une session antérieure : cycle `send` (envoyée en cuisine) → `ask` (appelée/relancée) → `do` (en préparation) → `seed` (envoyée en salle) → `done` (servie). Toute la conception ci-dessous part de ces fondations déjà posées plutôt que de les redéfinir.

### Modèle d'état retenu

Deux niveaux d'état, volontairement distincts :
- **`order_sections.state`** (nouveau, migration `add_state_to_order_sections_table`) : `en_attente` (par défaut) → `demande` → `fait`. C'est le cycle "une section à la fois" décrit dans Readme.md ("valider une section puis la demander", "les postes peuvent la marquer comme faite").
- **`orders.state`** (déjà existant, 5 valeurs) : reste le cycle global de la commande, piloté automatiquement par les transitions de sections plutôt que par une action dédiée :
  - `send` → `ask` : dès que la **première** section de la commande passe à `demande` (`OrderSectionController::demander`).
  - `ask` → `do` : dès que **toutes** les sections de la commande sont `fait` (`OrderSectionController::marquerFait` vérifie `sections()->where('state','!=','fait')->doesntExist()`).
  - `do` → `seed` : seule transition **manuelle**, via `OrderController::envoyer` — "le passe peut marquer la commande en Envoyé". Refuse (422) si `state !== 'do'`, impose donc que toutes les sections soient prêtes avant de pouvoir envoyer.
  - `done` : non utilisé par cette implémentation (aucun endpoint ne l'atteint) — laissé disponible pour une étape future (ex. "commande physiquement servie", hors kitchen display).
- **Visibilité kitchen display** : une commande reste affichée tant que son `state` n'est pas `seed`/`done` — "Quand la commande est envoyée elle disparaît de kitchen display".

### Backend (`erp-api`)

- `OrderSectionController::demander` : refuse (422) une section vide (même règle que `::store`) ou déjà demandée/faite. Diffuse `OrderKitchenUpdated`.
- `OrderSectionController::marquerFait` : refuse (422) une section pas encore demandée. Diffuse `OrderKitchenUpdated`.
- `OrderController::envoyer` : refuse (422) si la commande n'est pas à `do`. Diffuse `OrderKitchenUpdated`.
- `OrderLineController::assertEditable` (nouveau, appelé par `store`/`update`/`destroy`) : refuse (422) de modifier une ligne dont la section n'est plus `en_attente` — une section "demandée" est déjà partie en cuisine, la modifier après coup désynchroniserait ce que la cuisine prépare de la commande réelle. Pour ajouter des articles après avoir demandé une section, il faut ouvrir une nouvelle section (règle déjà existante : "on peut ajouter une section que si la précédente contient au moins un article").
- **"Le bon passe"** (Readme.md) : `Passe` (modèle `belongsTo(Station)`) existe déjà en base mais reste **hors scope ici** — aucune UI/route ajoutée pour gérer explicitement "quel passe pour quelle commande". À la place, l'action "Envoyer" (rôle du passe) n'est proposée que dans la vue **"Tous les postes"** du kitchen display (jamais en vue filtrée par poste) : le passe a par nature besoin de voir l'ensemble des postes d'une commande avant de l'expédier, ce qui capture le comportement attendu sans construire une gestion d'affectation passe↔station non spécifiée par la demande.
- **Laravel Reverb** (`composer require laravel/reverb`, `php artisan reverb:install`) : ajouté comme driver de broadcasting self-hosted (pas de dépendance cloud comme Pusher — cohérent avec le reste du projet, entièrement en Docker Compose local). Nécessite l'extension PHP `pcntl` (ajoutée au `Dockerfile` d'`erp-api`, absente par défaut — sans elle `reverb:start` plante immédiatement sur `Undefined constant SIGINT`).
- `App\Events\OrderKitchenUpdated` : `ShouldBroadcastNow` (pas `ShouldBroadcast` — aucun worker de queue actif dans ce projet, `QUEUE_CONNECTION=database` sans process `queue:work` dédié, donc la diffusion doit être synchrone). Canal **public** `kitchen` (pas de scope par utilisateur, salle et cuisine partagent la même vue), événement nommé `order.updated`, payload minimal (`orderId`) — les clients rechargent la commande/liste complète, cohérent avec le reste de l'app (jamais d'état dérivé local, toujours un refetch après mutation). Diffusé sur : ouverture de table, annulation de commande, `demander`, `marquerFait`, `envoyer`.
- Nouvelles routes (`auth:sanctum`) : `POST order-sections/{id}/demander`, `POST order-sections/{id}/marquer-fait`, `POST orders/{id}/envoyer`.
- **Service `reverb` dans `docker-compose.yml`** : même image que `api` (même code/vendor) mais **`entrypoint` remplacé** (`php artisan reverb:start --host=0.0.0.0 --port=8080`, sans passer par `docker/entrypoint.sh`) — volontaire, pour éviter que les deux conteneurs (`api` et `reverb`) ne relancent chacun `migrate --force && db:seed --force` au démarrage (course possible + risque de doublons si un seeder n'est pas strictement idempotent). Port hôte `19004` (`REVERB_PORT_HOST`) → port conteneur `8080`.
- **`.env`/`.env.example`** : nouvelles variables `BROADCAST_CONNECTION=reverb`, `REVERB_APP_ID/KEY/SECRET`, `REVERB_HOST=reverb` + `REVERB_PORT=8080` + `REVERB_SCHEME=http` (utilisées **côté serveur**, par le conteneur `api` pour joindre `reverb` sur le réseau Docker interne — different de ce que le navigateur utilise), `REVERB_SERVER_HOST`/`REVERB_SERVER_PORT` (écoute du process `reverb:start`).
- **Vérifié de bout en bout** : `curl` complet du cycle (section vide → 422 sur `demander` → ligne ajoutée → `demander` → 200, `order.state=ask` → re-`demander` → 422 → `envoyer` avant `fait` → 422 → `marquerFait` → `order.state=do` → `envoyer` → `order.state=seed`) — **et** un vrai client WebSocket (`ws`, script Node dans le scratchpad) abonné au canal `kitchen` a reçu l'événement `order.updated` en temps réel lors d'une mutation, confirmant que le pipeline `event() → Reverb → navigateur` fonctionne réellement, pas seulement en théorie.

### `erp-app` (POS - Restaurant)

- `OrderSection.state` ajouté au modèle front, badge d'état sur chaque pastille de section (`badge-neutral`/`badge-warning`/`badge-success` — classes déjà existantes, pas de nouvelles créées).
- Bouton "🔔 Demander en cuisine" dans le pied du panier, visible seulement si la section active est `en_attente` et non vide.
- Une fois une section `demande`/`fait` : grille produits, +/-, suppression de ligne tous désactivés pour cette section (`activeSectionEditable` computed) — reflète côté UI la règle backend `OrderLineController::assertEditable`.
- `core/kitchen-echo.service.ts` (nouveau) : connexion Laravel Echo/Reverb, écoute `kitchen` → `order.updated`, `order-builder` rafraîchit la commande courante si l'id correspond (`takeUntilDestroyed()` pour éviter les abonnements qui s'accumulent en revisitant la page).
- `core/reverb-config.ts` : mêmes conventions que `api-config.ts` (host dérivé de `window.location.hostname`, pas de "localhost" en dur — accessible depuis un iPad/tablette sur le même réseau).
- `npm install laravel-echo pusher-js` (Reverb parle le protocole Pusher, `pusher-js` reste le client utilisé même sans compte Pusher).

### `erp_kitchen_display/` — nouvelle app Angular (2026-07-30, pas testée en navigateur par moi — l'utilisateur l'a déjà ouverte de son côté, requêtes réelles visibles dans les logs api)

Scaffoldée à partir d'une copie de `erp_validate_event/` (même structure kiosque : login QR/mot de passe, garde d'auth, thème clair/sombre, token Sanctum dupliqué plutôt que partagé — deux workspaces Angular séparés, même convention que `erp_validate_event` vis-à-vis d'`erp-app`) — pages événement retirées, remplacées par une seule page `kitchen-board`.

- **`pages/kitchen-board`** : pastilles "Tous les postes" + une par `Station` (voir `core/station.service.ts`). Grille de cartes, une carte par commande ouverte (table + salle en en-tête), chaque carte listant ses sections avec badge d'état et leurs lignes.
  - **Filtre par poste** : filtre les **lignes** de chaque section (pas des sections entières) sur `product.station_id === posteSélectionné` — un même section peut mélanger des produits de postes différents (ex. "Entrées" avec un plat froid et un plat chaud). Une section sans aucune ligne du poste sélectionné est masquée ; une commande sans aucune section restante est masquée.
  - Bouton "👨‍🍳 Marquer prête" par section, actif seulement si `state === 'demande'`.
  - Bouton "✅ Envoyer" par commande, actif seulement si `order.state === 'do'` **et** vue "Tous les postes" (voir plus haut, rôle du passe).
  - `core/kitchen-echo.service.ts` : même mécanisme que côté `erp-app`, mais recharge toute la liste des commandes à chaque événement (pas de ciblage par id, la vue kitchen display affiche déjà tout).
- **Docker** : service `kitchen_display` dans `docker-compose.yml`, même pattern que `app`/`validate_event` (bind mount + volume nommé pour `node_modules`, `ng serve --poll` en dev). Port hôte `19005` (`KITCHEN_DISPLAY_PORT`).
- **Vérifié** : build Angular propre dans les logs du conteneur (`docker logs erp_v2_kitchen_display`, chunks `kitchen-board`/`login` générés sans erreur), `curl` de la page racine (200), et un scénario `curl` complet (ouverture de table → ajout produit → `demander`) confirmant que la forme JSON retournée par `GET /orders` correspond exactement à ce que consomme `kitchen-board.ts` (states de section, `product.station_id` présent pour le filtrage par poste). Pas de test interactif en navigateur de mon côté (pas d'outil Playwright invoqué cette fois) — mais les logs `erp_v2_api` montrent déjà des requêtes réelles depuis `http://localhost:19005/` avec un User-Agent Safari, donc l'app a été ouverte et fonctionne au moins jusqu'au chargement de la liste des commandes.

### Hors scope, pour une prochaine étape

- Gestion explicite des `Passe` (assigner un passe à une ou plusieurs stations, choisir "le bon passe" pour une commande donnée) — contournée pour l'instant via la vue "Tous les postes" (voir plus haut).
- `orders.state = 'done'` ("servie") — valeur du cycle déjà réservée en base mais qu'aucun endpoint n'atteint actuellement.
- Authentification/autorisation par rôle sur les actions cuisine (aujourd'hui, n'importe quel utilisateur connecté à `erp_kitchen_display` peut marquer n'importe quelle section faite ou envoyer n'importe quelle commande — cohérent avec le reste du projet où les rôles existent mais ne sont pas encore appliqués finement, voir "Définir ce qui est disponible de faire avec les differant role user" dans Readme.md).

## Correction : envoi section par section + routage par passe (2026-07-30)

Retour utilisateur après la première version du kitchen display : "il faut envoyer section par section quand la section est marquée comme prête" et "il faut qu'elle passe par son passe correspondant dans kitchen display". Deux corrections distinctes sur le design initial (voir section précédente) :

1. **L'envoi devient une action par section, pas par commande.** La version précédente gatait "Envoyer" au niveau de la commande entière (`orders.state === 'do'`, c'est-à-dire toutes les sections `fait`) — ce qui forçait à attendre que toute la commande soit prête avant de pouvoir en expédier ne serait-ce qu'une section. Corrigé : `OrderController::envoyer` **supprimé**, remplacé par `OrderSectionController::envoyer(OrderSection)` — refuse (422) si la section n'est pas `fait`, sinon passe à un 4ᵉ état `envoye`. Une fois **toutes** les sections d'une commande à `envoye`, la commande passe automatiquement à `seed` et disparaît du kitchen display (le comportement de disparition annoncé dès la première version reste vrai, juste atteint différemment — agrégation des envois individuels plutôt qu'une action manuelle unique). `OrderSectionController::marquerFait` ajusté en conséquence : la transition `ask` → `do` de la commande vérifie désormais "toutes les sections sont `fait` **ou** `envoye`" (`whereNotIn('state', ['fait','envoye'])`) — nécessaire car avec un envoi section par section, une section peut atteindre `envoye` avant qu'une autre section de la même commande atteigne seulement `fait`.
2. **Routage par passe.** Question posée à l'utilisateur sur la règle de correspondance section → passe (le modèle `Passe belongsTo Station` existait déjà mais n'était câblé nulle part) : **réponse retenue — 1 station = 1 passe, dérivé automatiquement** (pas de choix manuel). Règle implémentée côté front (`kitchen-board.ts`) : le passe correspondant d'une section = le `Passe` dont `station_id` correspond à la station du produit de la **première ligne** de la section. Affiché à titre indicatif (`→ Passe Cuisine`) à côté du badge d'état. **Le bouton "Envoyer" reste disponible depuis n'importe quelle vue** (Tous ou poste filtré), pas seulement dans la vue du passe correspondant — volontaire : `PasseSeeder` ne couvre que 2 des 5 stations ("Passe Cuisine"→Viande, "Passe Bar"→Bar ; Poisson/Froid/Dessert n'ont aucun passe dédié), donc gater strictement l'envoi au passe correspondant aurait rendu certaines sections définitivement impossibles à envoyer — même piège que la version précédente que cette correction visait justement à corriger.

### Backend

- `App\Http\Controllers\Api\PasseController` (nouveau, CRUD complet façon `StationController`) + `Route::apiResource('passes', ...)`. `index()` eager-load `station`.
- `OrderSectionController::envoyer` (nouveau) : voir logique ci-dessus. `OrderController::envoyer` supprimé (route `POST orders/{order}/envoyer` remplacée par `POST order-sections/{order_section}/envoyer`).
- **Vérifié via `curl`** : `envoyer` avant `fait` → 422 ; `marquer-fait` sur une commande à une seule section → `order.state` passe directement à `do` (toutes ses sections sont `fait`) ; `envoyer` cette section → `order.state` passe à `seed` (toutes ses sections sont `envoye`) ; `GET /passes` retourne bien `Passe Bar`→station Bar et `Passe Cuisine`→station Viande avec la relation `station` chargée.

### `erp_kitchen_display`

- `core/models/order.model.ts` : `OrderSection.state` étendu avec `'envoye'` ; nouveau type `Passe`.
- `core/passe.service.ts` (nouveau, `GET /passes`).
- `core/order-section.service.ts` : ajout de `envoyer(sectionId)`. `core/order.service.ts` : `envoyer(orderId)` retiré (endpoint supprimé côté API).
- `kitchen-board.ts` : `DisplaySection` porte désormais aussi son `passe` calculé (station de la première ligne → `Passe` correspondant, ou `null` si la station n'a pas de passe dédié). `canSend`/`send` opèrent maintenant sur une `OrderSection`, plus sur un `Order`. Le bouton "✅ Envoyer" est descendu du `card-header` (commande) vers chaque `.kitchen-card__section` (section), à côté de "👨‍🍳 Marquer prête". Badge `envoye` ajouté (`badge-info`, classe déjà existante).
- **Vérifié** : build Angular propre dans les logs du conteneur après la modification (une erreur TS transitoire est apparue entre les deux sauvegardes `kitchen-board.ts`/`.html`, résolue par le rebuild suivant — normal avec `ng serve --poll`, pas un vrai problème).

### Hors scope, toujours en attente

- `Passe` reste sans UI de gestion dans `erp-app/parametres` (créé/modifié seulement via `PasseSeeder` ou directement en API) — pas demandé explicitement, seul le routage automatique dans le kitchen display l'était.
- Stations sans passe dédié (Poisson, Froid, Dessert) : leurs sections n'affichent aucun `→ Passe X` (juste le badge d'état) mais restent envoyables normalement depuis la vue "Tous" ou leur poste filtré.

## Correction : cycle de section aligné sur Send/Ask/Do/Seed/Done + filtre par Passe (2026-07-30)

Nouveau retour utilisateur, encore plus précis que les deux précédents : "donc la order section (Send -> Ask -> Do -> Seed -> Done)" avec le mapping explicite action→état→effet pour chacune des 4 transitions, plus "afficher tous les passes et les différents passes" dans le kitchen display. Question posée pour lever l'ambiguïté restante ("valider" et "demander en cuisine" sont-ils une seule action ou deux ?) — **réponse : deux actions séparées**, ce qui change réellement le flux POS - Restaurant (pas juste un renommage).

### Nouveau cycle `order_sections.state` (aligné sur `orders.state`)

```
en_attente (défaut, pas encore validée)
  --[valider]--> send (verrouillée, visible sur le kitchen display, pas encore en file active)
  --[demander en cuisine]--> ask (appelée, les postes doivent la préparer)
  --[marquer faite]--> do (le poste correspondant l'a préparée)
  --[envoyer]--> seed (le passe correspondant l'a expédiée, section par section)
  done (non atteint par cette implémentation, comme orders.state — voir plus bas)
```

`en_attente` reste hors du cycle "officiel" nommé — c'est l'état "en cours de composition, rien à faire ni à afficher côté cuisine", pas une valeur de `(Send -> Ask -> Do -> Seed -> Done)`.

### Backend

- Migration `remap_order_sections_state_values` : remappe les données existantes (demande→ask, fait→do, envoye→seed) — pas de changement de schéma (toujours une colonne `string`), juste une correction du vocabulaire déjà en base.
- `OrderSectionController::valider` (nouveau) : `en_attente` → `send`, mêmes gardes que l'ancien `demander` (refuse une section vide ou déjà validée). C'est cette action qui broadcast `OrderKitchenUpdated` en premier — la section "apparaît" sur le kitchen display à ce moment, avant même d'être activement demandée.
- `OrderSectionController::demander` : gardé (refuse maintenant si `state !== 'send'`, donc si pas encore validée), `send` → `ask`. Fait toujours passer `orders.state` de `send` à `ask` à la première section demandée.
- `OrderSectionController::marquerFait` : `ask` → `do` (guard mis à jour). `orders.state` passe à `do` une fois toutes les sections à `do` ou `seed`.
- `OrderSectionController::envoyer` : `do` → `seed` (guard mis à jour), toujours section par section (voir correction précédente). `orders.state` passe à `seed` une fois toutes les sections à `seed`.
- Route ajoutée : `POST order-sections/{order_section}/valider`.
- **Vérifié via `curl` + un vrai client WebSocket abonné au canal `kitchen`** : `valider` sur une section vide → 422 ; `demander` avant `valider` → 422 ; `valider` → `send` (order reste `send`) ; `demander` → `ask` (order passe à `ask`) ; `marquer-fait` → `do` (order passe à `do`) ; `envoyer` → `seed` (order passe à `seed`) — **chacune des 4 transitions a bien déclenché un événement `order.updated` reçu en temps réel** par le client WebSocket de test.

### `erp-app` (POS - Restaurant)

- `OrderSection.state` étendu au cycle complet (`en_attente | send | ask | do | seed | done`).
- `order-section.service.ts` : `valider()` ajouté (nouveau endpoint), `demander()` conservé mais pointe maintenant vers la transition `send → ask`.
- `order-builder.ts`/`.html` : **deux boutons désormais**, affichés selon l'état de la section active — "✅ Valider la section" (visible si `en_attente`, appelle `validerSection()`) puis "🔔 Demander en cuisine" (visible seulement une fois `send`, appelle `demanderSection()`). Chacun a sa propre confirmation (`confirm()`). Badge d'état mis à jour (`sectionStateLabel`) avec les 6 valeurs, `activeSectionEditable` inchangé (toujours verrouillé dès que l'état quitte `en_attente`).

### `erp_kitchen_display`

- `OrderSection.state` étendu au même cycle complet.
- **Filtre par Passe, pas par Station** : "afficher tous les passes et les différents passes" — les pastilles de filtre (`kitchen-board.html`) sont passées de "Tous les postes + une par Station" à "Tous les passes + une par `Passe`" (`selectPasse`/`selectedPasseId`, remplace `selectStation`/`selectedStationId`). Le filtrage des lignes reste techniquement basé sur `product.station_id`, mais comparé à `passe.station_id` du passe sélectionné plutôt qu'à une station brute — `core/station.service.ts` n'étant plus utilisé nulle part, supprimé.
- `canMarkDone`/`canSend` mis à jour sur les nouveaux noms (`ask`→`do` pour marquer fait, `do`→`seed` pour envoyer).
- **Vérifié** : build Angular propre (`docker logs erp_v2_kitchen_display`), et le scénario `curl` ci-dessus couvre aussi les endpoints consommés par cette app (`marquer-fait`, `envoyer`, `/passes`).

### Toujours hors scope

- `done` reste un état non atteint par un quelconque endpoint (ni sur `orders`, ni sur `order_sections`) — réservé pour une étape future (ex. "physiquement servie en salle"), cohérent avec l'historique de `orders.state`.
- Gestion CRUD des `Passe` dans `erp-app/parametres` — toujours pas demandée, `PasseSeeder` reste la seule source (Viande→Passe Cuisine, Bar→Passe Bar).

## Kitchen display : filtre à deux dimensions (Postes + Passes) (2026-07-30)

Retour utilisateur : "on doit voir les stations et les passes" — la correction précédente avait remplacé le filtre par Station par un filtre par Passe ; l'utilisateur veut en réalité **les deux dimensions présentes en même temps**, pas l'une à la place de l'autre : "Tout - toutes les stations, chacune des différentes stations - tous les passes, chacun des passes".

- `core/station.service.ts` réintroduit (supprimé par erreur lors de la correction précédente, en pensant le filtre Station entièrement remplacé par le filtre Passe).
- `kitchen-board.ts` : nouveau type `BoardFilter = { kind: 'station'; id } | { kind: 'passe'; id } | null` — un seul filtre actif à la fois, sélectionner un poste désactive visuellement le passe sélectionné et inversement (`isStationActive`/`isPasseActive`). `filterStationId` (computed) résout le filtre actif vers une station_id unique quel que soit son type (directe pour un poste, via `Passe.station_id` pour un passe) — le filtrage des lignes reste inchangé (toujours sur `product.station_id`).
- **Trois rangées de pastilles** dans `kitchen-board.html` : "Tout" (seule, remet le filtre à `null`), "Postes" (+ "Toutes les stations", qui remet aussi à `null`, + une pastille par `Station`), "Passes" (+ "Tous les passes", idem, + une pastille par `Passe`) — reflète littéralement la structure à 3 groupes décrite par l'utilisateur.
- **Vérifié** : build Angular propre (`docker logs erp_v2_kitchen_display`), `GET /stations` confirmé retourner les 5 stations seedées (Bar, Dessert, Froid, Poisson, Viande) pour peupler la rangée "Postes".

## Correction : le transfert vers kitchen display ne part qu'à la validation (2026-07-30)

Retour utilisateur : "on met la section en attente que quand on valide la section et on transfère la section dans kitchen display avec reverb". Bug réel identifié : `OrderController::store` (ouverture d'une table) diffusait déjà `OrderKitchenUpdated` à la création — la section auto-créée ("Section 1"), encore `en_attente`, apparaissait donc immédiatement sur le kitchen display avant même d'avoir été composée ou validée.

- `OrderController::store` : broadcast retiré. Ouvrir une table ne notifie plus la cuisine — le premier événement pertinent reste `OrderSectionController::valider`.
- `erp_kitchen_display/kitchen-board.ts` : filtre défensif ajouté sur `displayOrders` (`section.state !== 'en_attente'`) — une section non validée ne s'affiche jamais sur le board, même si un futur changement réintroduisait un broadcast prématuré ailleurs.
- Hosts `erp_kitchen_display` et `erp-app` : `node_modules` local (utilisé par l'éditeur pour le TS, distinct du volume Docker) manquait des paquets récemment ajoutés (`@angular/*` entièrement absent côté `erp_kitchen_display` — jamais eu de `npm install` sur l'hôte depuis le scaffolding par copie de `erp_validate_event`) — réinstallé.
- **Vérifié via `curl` + un vrai client WebSocket** : ouverture de table + ajout d'une ligne → aucun événement `order.updated` reçu ; `valider` → un seul événement, avec l'id de la commande concernée.

## Kitchen display : une section "prête" quitte la vue Poste, reste dans la vue Passe (2026-07-30)

Retour utilisateur : "une fois la section marquée comme prête, la section doit passer sur le bon passe correspondant". Jusqu'ici, une section `do` restait affichée indéfiniment dans toutes les vues (Tout, n'importe quel Poste, n'importe quel Passe) — pas de vrai geste de "passation" entre la cuisine et l'expédition.

- `kitchen-board.ts` (`displayOrders`) : filtre ajouté, actif **seulement en vue Poste filtrée** (`filter().kind === 'station'`) — une section `do`/`seed`/`done` y disparaît (le poste a fini son travail dessus, elle bascule sous la responsabilité du passe). Vues "Tout" et "Passes" inchangées, continuent de l'afficher (c'est là que le passe la retrouve pour cliquer "Envoyer").
- Reproduit le comportement d'un vrai KDS professionnel : les items disparaissent de l'écran du poste de cuisine dès qu'ils sont prêts, pour ne plus encombrer sa file, et n'apparaissent que côté expo/passe.
- Vérifié par compilation (`docker logs erp_v2_kitchen_display`) — logique de filtrage pure côté client, données déjà vérifiées de bout en bout dans les corrections précédentes.

## Kitchen display : filtre à 5 états mutuellement exclusifs, plus de pastilles actives en double (2026-07-30)

Retour utilisateur : "les sélecteurs filtre ne fonctionnent pas bien. On doit pouvoir sélectionner Tout ou Tous les postes ou Toutes les stations". Cause : `BoardFilter` ne distinguait que 3 états (`null`/station/passe) — "Tout", "Toutes les stations" et "Tous les passes" pointaient tous les trois vers le même `null`, donc les 3 pastilles de reset s'allumaient **simultanément** dès qu'aucun poste/passe précis n'était sélectionné, même si l'utilisateur n'avait cliqué que sur l'une d'entre elles — source de confusion ("on dirait que ça ne marche pas").

- `BoardFilter` étendu à 5 variantes explicites et mutuellement exclusives : `null` ("Tout"), `{kind:'all-stations'}`, `{kind:'station',id}`, `{kind:'all-passes'}`, `{kind:'passe',id}`. Chaque pastille de reset a maintenant son propre état distinct — une seule pastille active à la fois, quel que soit le groupe.
- `isStationPerspective` (nouveau computed) : vrai pour `station` ET `all-stations` — la règle "une section prête quitte la vue Poste" (voir correction précédente) s'applique désormais aussi en "Tous les postes", pas seulement sur un poste précis.
- `filterStationId` réécrit en if/else par discriminant `kind` plutôt qu'un `||` combinant égalité stricte et accès de propriété — la version précédente ne se resserrait pas correctement en TypeScript (l'IDE remontait une erreur de type sur `current.id`, `'all-stations'`/`'all-passes'` n'étaient pas exclus après le premier `if`).
- Nouvelles méthodes `selectAllStations`/`selectAllPasses`/`isAllActive`/`isAllStationsActive`/`isAllPassesActive`, template mis à jour ("Toutes les stations" renommé "Tous les postes" pour matcher le vocabulaire de Readme.md).
- Vérifié par compilation (`docker logs erp_v2_kitchen_display`) — logique de filtrage pure côté client.

## POS Restaurant — paiement, conversion en Ticket, email (2026-07-30)

Dernière étape du spec POS Restaurant du Readme.md, jusqu'ici volontairement hors scope : "quand toutes les sections sont envoyées on peut payer", split espèces/Bancontact avec rendu, "quand une order est payée elle devient un ticket", impression + email si client sélectionné. Construit en réutilisant fidèlement le pattern déjà établi par POS Vente directe (`pos-vente.ts`/`TicketController::store`) plutôt qu'en inventant un nouveau flux.

### Backend

- **`OrderController::pay(Order $order)`** (nouveau, `POST orders/{order}/pay`) :
  - Refuse (422) tant qu'une section n'est pas `seed` ("quand toutes les sections sont envoyées on peut payer") — même règle recalculée côté serveur que le front (`allSectionsSent`), source de vérité.
  - Même validation "somme des paiements == total" que `TicketController::store` (vente directe) — total toujours recalculé depuis `Product::price` au moment du paiement, jamais fait confiance au payload.
  - **Order → Ticket** : chaque `OrderSection` devient une `TicketSection` (même `name`, l'état n'a plus de sens une fois payé donc pas reporté — `TicketSection` n'a pas de colonne `state`), chaque `OrderLine` devient une `TicketLine` avec le prix figé (`unit_price`). `client_id` et `send_email` viennent du payload (pas de l'Order, qui n'a jamais de client attaché avant cet instant — sélectionné à l'écran de paiement, même UX que pos-vente). `table_id` de l'Order reporté sur le Ticket (`tickets.table_id` existait déjà en base mais n'était utilisé par aucun endpoint jusqu'ici).
  - La commande est ensuite supprimée (`$order->delete()`, cascade sections/lignes) — libère la table, même mécanisme que `::destroy` (annulation).
  - `event(new OrderKitchenUpdated(...))` rediffusé après paiement (l'ordre devrait déjà être filtré du kitchen display à ce stade puisque `seed`, mais garantit la cohérence si un client KDS avait une vue périmée).
  - Email : si `send_email` et que le client a un email, `Mail::to(...)->send(new TicketMail($ticket))` — synchrone (pas de queue déployée, même raison que partout ailleurs dans ce projet).
- **`App\Mail\TicketMail`** + `resources/views/emails/ticket.blade.php` (nouveaux) : reçu email par sections/lignes/total/paiements, même style visuel que `EventTicketsMail`/`emails/event-tickets.blade.php` (couleurs/mise en page identiques, cohérence de marque).
- **Vérifié via `curl`** de bout en bout : refus avant envoi (422), refus si le total des paiements ne correspond pas (422), commande à 2 sections indépendantes (chacune son propre cycle complet valider→demander→fait→envoyer) payée en un seul appel avec split espèces/carte + client + email → ticket avec 2 sections et 2 lignes de paiement, table effectivement libérée (`GET /orders/{id}` → 404, absente de `GET /orders`).

### `erp-app` (order-builder)

- **Bouton Paiement** : `allSectionsSent` (computed : au moins une section, toutes à `seed`) remplace le stub `[disabled]="orderTotal() === 0"` — affiche le total dans le libellé (`💳 Paiement — {{ total }}`), plus de `title="Pas encore implémenté"`. Message discret sous le bouton tant que ce n'est pas activé.
- **Modal de paiement** : copie quasi à l'identique du modal `pos-vente.html`/`.ts` (sélecteur client avec recherche/création rapide, pastilles de moyens de paiement, clavier visuel pour les espèces avec calcul du rendu en direct — `changeDue`/`appliedAmount`, jamais persistés, purement un affichage caissier comme dans pos-vente). Ajout par rapport à pos-vente : case à cocher "Envoyer le ticket par email à {{ email }}" (`sendEmailOnPay`), visible seulement si le client sélectionné a un email.
- **Après paiement réussi** : la commande n'existe plus côté backend (supprimée) — au lieu de rafraîchir l'`Order` (qui 404 désormais), le composant bascule sur un signal `paidTicket` qui remplace tout l'affichage par un écran de confirmation (numéro de ticket, table, détail sections/lignes/paiements) avec deux actions : "🖨️ Imprimer" et "Retour aux tables".
- **Impression** (`printTicket()` → `window.print()`) : nouveau pattern CSS global dans `styles.css` (`@media print`, classe `.ticket-print`) — masque tout le reste de la page à l'impression, ne laisse que le bloc reçu. Réutilisable tel quel si `pos-vente` reçoit un jour la même fonctionnalité (pas fait maintenant, hors scope de cette demande qui ciblait spécifiquement POS Restaurant).
- `core/order.service.ts` : `pay()` ajouté. `core/models/order.model.ts` : `PayOrderPayload`. `core/models/ticket.model.ts` : `Ticket.table_id`/`table` ajoutés (le type ne les portait pas encore, la vente directe ne les utilisant jamais).
- Vérifié par compilation (`docker logs erp_v2_app`, chunk `order-builder` régénéré sans erreur, `styles.css` idem) — pas de test interactif en navigateur cette fois (pas demandé explicitement, backend + build suffisent pour ce tour).

### Hors scope

- Aucune modification de `pos-vente` (impression/email n'existaient nulle part avant cette session — construits ici uniquement pour POS Restaurant, mais de façon assez générique pour être branchés sur la vente directe plus tard si demandé).
- `TicketSection`/`TicketLine` n'ont toujours pas de notion de "poste"/"passe" — un ticket est un instantané figé post-paiement, le workflow cuisine (kitchen display) s'arrête à `orders`/`order_sections`.

## Paramètres : CRUD Passe + bug de binding de route corrigé (2026-07-30)

`PasseController` avait déjà un CRUD complet (construit lors du câblage du kitchen display), mais aucune UI dans `erp-app/parametres` pour le piloter — comblé maintenant, même pattern que Stations (liste + formulaire, station choisie via `<select>`).

- `core/models/reference.model.ts` : `Passe` ajouté (`{id, name, slug, station_id, station?}`).
- `core/passe.service.ts` (nouveau) : `PasseService extends CachedResourceService<Passe>`, une ligne, même pattern que `PaymentMethodService`.
- `pages/parametres/passes/passe-list` + `passe-form` (nouveaux) : copie quasi identique de `pages/parametres/stations/*`, le formulaire ajoute un `<select>` Station (première station sélectionnée par défaut à la création).
- Routes (`app.routes.ts`) + carte "📣 Passes" ajoutée au hub `parametres-home.ts`.

### Bug réel découvert en vérifiant le CRUD : `update`/`show`/`destroy` cassés en silence

`Route::apiResource('passes', PasseController::class)` génère par défaut un paramètre de route `{pass}` — Laravel singularise "passes" en anglais ("a pass"), pas en français ("un passe"). `PasseController` type-hint `Passe $passe` (nom différent) : le binding implicite de route ne trouve alors aucun paramètre de route nommé `passe`, et Laravel injecte une instance `Passe` **vide, non liée à la base**, au lieu d'échouer bruyamment.

Conséquences concrètes, aucune ne renvoyant d'erreur :
- `PUT /passes/{id}` → `200` avec `{"station":null}` — `Model::update()` sur un modèle `exists=false` retourne silencieusement `false` sans rien modifier (aucune ligne en base changée).
- `DELETE /passes/{id}` → `204` sans rien supprimer — `Model::delete()` sur un modèle `exists=false` est un no-op silencieux.
- `GET /passes/{id}` aurait eu le même problème (jamais remarqué car `index()` — sans binding — était le seul endpoint testé jusqu'ici).

`StationController` n'a pas ce problème (le singulier anglais de "stations" est bien "station", pas de divergence).

- **Fix** : `Route::apiResource('passes', PasseController::class)->parameters(['passes' => 'passe'])` — force le paramètre de route à `{passe}`, aligné sur le controller.
- **Nettoyage** : deux lignes fantômes créées pendant le diagnostic (des `PUT` qui, faute de binding, tombaient dans la branche `update()` no-op — mais les `POST`/`store()` de test, eux, avaient bien fonctionné et laissé de vraies lignes) supprimées manuellement en tinker.
- **Revérifié** intégralement après le fix : `create` → `show` → `update` (renvoie bien le bon enregistrement modifié) → `destroy` (confirmé absent de la liste ensuite) — cycle complet correct cette fois.

## Relation Passe/Station inversée : le choix se fait depuis Station (2026-07-30)

Retour utilisateur : "c'est dans station qu'on doit pouvoir choisir dans quelle passe ça doit aller". Le schéma `passes.station_id` (un passe = une seule station, choix délibéré documenté plus haut dans ce fichier) est abandonné au profit du schéma de `ERP/` (le projet original, jamais suivi jusqu'ici malgré la note explicite dans `PasseSeeder`) : **`stations.passe_id`** — plusieurs stations peuvent désormais partager un même passe, ce qui correspond mieux à une vraie cuisine (un même point d'expédition dessert souvent plusieurs postes).

### Backend

- Migration `invert_passe_station_relationship` : ajoute `stations.passe_id` (nullable, `nullOnDelete`), reporte les données existantes (`passes.station_id` → `stations.passe_id` pour chaque ligne) avant de supprimer l'ancienne colonne `passes.station_id`. `down()` symétrique pour un rollback propre.
- `Station` : `passe_id` ajouté au `#[Fillable]`, nouvelle relation `passe(): BelongsTo`.
- `Passe` : `station_id` retiré du `#[Fillable]`, `station(): BelongsTo` remplacé par `stations(): HasMany`.
- `StationController` : `store`/`update` acceptent maintenant `passe_id` (nullable), `index`/`show` eager-load `passe`.
- `PasseController` : `store`/`update` ne prennent plus que `name` (le lien se fait côté Station), `index`/`show` eager-load `stations` (pluriel).
- `PasseSeeder` réécrit : crée d'abord les passes (sans lien), puis assigne `passe_id` aux stations correspondantes (`Viande`→Passe Cuisine, `Bar`→Passe Bar) — inverse de l'ancien seeder qui créait le passe directement avec sa station.

### `erp-app` (Paramètres)

- `core/models/reference.model.ts` : `Station.passe_id`/`passe?` ajoutés, `Passe.station_id`/`station?` retirés, `Passe.stations?` ajouté.
- **`station-form`** : nouveau `<select>` "Passe" (optionnel, "— Aucun —" par défaut) — c'est ICI que le choix se fait maintenant, comme demandé.
- **`passe-form`** : le `<select>` Station retiré, remplacé par un texte explicatif renvoyant vers Stations pour faire le lien.
- **`station-list`**/**`passe-list`** : colonnes mises à jour en conséquence (Station affiche son Passe ; Passe affiche la liste de ses Stations, jointes par virgule).

### `erp_kitchen_display`

- `core/models/order.model.ts` : mêmes changements de forme que `reference.model.ts` côté erp-app.
- `kitchen-board.ts` : le filtre par passe devait auparavant résoudre un `station_id` UNIQUE (`passe.station_id`) ; il résout maintenant un **`Set<number>`** de stations (`filterStationIds`, toutes les stations dont `passe_id` correspond) — une ligne de section matche le filtre si sa station fait partie de cet ensemble. Le calcul du "passe correspondant" d'une section (affiché à titre indicatif) passe par la station de sa première ligne → `station.passe_id` → `Passe` — plus par `passe.station_id` qui n'existe plus.
- `core/station.service.ts` réintroduit dans erp-app n'était pas concerné (déjà générique) ; `erp_kitchen_display/core/station.service.ts` inchangé (déjà juste un GET liste).

### Vérifié

- Backend via `curl` : `stations.passe_id` correctement peuplé après migration (Viande/Bar conservent leur lien d'origine) ; assignation de `Froid` au même passe que `Viande` (`Passe Cuisine`) confirmée des deux côtés (`GET /stations/{id}` et `GET /passes/{id}.stations[]`) ; suppression du lien (`passe_id: null`) confirmée.
- Build Angular propre des deux côtés (`erp-app`, `erp_kitchen_display`).
- **Confirmation en conditions réelles** : en cours de vérification, la base montrait déjà `Poisson`, `Froid` et `Dessert` tous rattachés à `Passe Cuisine` (aux côtés de `Viande`) avec des timestamps très récents — cohérent avec un test en direct du nouveau formulaire Station par l'utilisateur pendant cette même session, confirmant que le partage d'un passe entre plusieurs stations fonctionne de bout en bout via la vraie UI, pas seulement en théorie.

## Bug de connexion : le clavier visuel ne tapait qu'en majuscules (2026-07-30)

Signalé sur `erp_kitchen_display` et `erp_validate_event` : impossible de se connecter par nom d'utilisateur/mot de passe. Cause confirmée par l'utilisateur — le clavier visuel du mode "⌨️ Mot de passe" (`KEYBOARD_ROWS = ['AZERTYUIOP', ...]`) n'affichait QUE des lettres majuscules, et `pressKey()` poussait la touche telle quelle : taper "admin"/"password" (les identifiants seedés, en minuscules) produisait en réalité "ADMIN"/"PASSWORD" — jamais les bons identifiants, aucune touche pour basculer en minuscule.

- `login.ts` (identique dans les deux apps, dupliqué comme tout le reste de ce composant) : nouveau signal `shiftOn` (faux par défaut), `pressKey()` applique `.toLowerCase()` sauf si `shiftOn()` est vrai. Minuscule par défaut plutôt que majuscule — correspond aux identifiants seedés réels (`admin`/`password`).
- `login.html` : les touches affichent maintenant `{{ shiftOn() ? key : key.toLowerCase() }}` (le clavier reflète visuellement ce qu'il va réellement taper, pas juste des majuscules figées) ; nouveau bouton "⇧ Maj" (façon verrouillage majuscule, pas une vraie touche Shift à relâcher) dans la rangée d'actions, à côté de "Effacer"/"⌫".
- `.btn-outline.is-active` ajouté aux deux `styles.css` (n'existait pas encore) pour indiquer visuellement l'état actif du bouton Maj.
- **Vérifié** : `POST /auth/login` avec `admin`/`password` (minuscules) confirmé `200` — c'est bien ce que le clavier produit désormais par défaut. Build Angular propre des deux apps.
- `erp-app` non concerné : son `/login` n'utilise pas ce clavier visuel (poste admin, clavier physique supposé).

## Audit responsive des 3 apps (2026-07-30)

Demande large : "rendre les apps responsive et vérifie les styles, vois si tu peux les améliorer". Plutôt qu'une refonte, audit ciblé sur les vrais points de rupture — vérifiés empiriquement via Playwright/Chromium (captures à 1440/820/375px), pas juste en théorie, après plusieurs corrections CSS ratées "en aveugle" plus tôt dans le projet (voir la saga overflow POS plus haut dans ce fichier).

### `erp-app` — sidebar auto-réduite sous 900px

La sidebar (`.app-sidebar`, 260px fixes) n'avait qu'une bascule **manuelle** vers le mode icônes (`.is-collapsed`, 76px) — sur tablette/petit écran, personne ne pense à cliquer "Réduire", et 260px de sidebar fixe laisse trop peu de place au contenu.

- Nouveau `@media (max-width: 900px)` : reprend telles quelles les déclarations déjà utilisées pour `.is-collapsed` (largeur 76px, labels masqués, nav centrée) — pas de nouvelle logique, juste appliquée inconditionnellement sous ce seuil. Le bouton "Réduire/Étendre" est masqué à cette largeur : en dessous de 900px la largeur est imposée par la mise en page, un bouton qui ne changerait plus rien serait juste source de confusion.
- **Vérifié par capture d'écran à 820px** : sidebar bien réduite en icônes, tableau de bord lisible avec beaucoup plus de place.

### Grilles CSS à colonnes fixes qui débordaient sur mobile

Repéré **par une vraie capture d'écran à 375px** (pas en théorie) : le tableau de bord (`dashboard.html`) utilisait `grid-template-columns: repeat(4, 1fr)` pour les tuiles stat et `repeat(auto-fit, minmax(320px, 1fr))` pour les cartes réservations/événements/tickets — sur un écran étroit, `auto-fit`/`minmax()` ne peut pas descendre en dessous du minimum indiqué (320px), donc la grille déborde au lieu de passer en une colonne. Même défaut trouvé par grep sur 3 autres pages (`cash-session-detail.html`, `booking-form.html`, `event-detail.html`).

- Fix générique : `minmax(320px, 1fr)` → `minmax(min(320px, 100%), 1fr)` (le `min()` plafonne le minimum à la largeur réelle du conteneur — la grille peut donc toujours descendre à une seule colonne, quelle que soit l'étroitesse de l'écran, sans avoir besoin d'un breakpoint dédié). Appliqué à `dashboard.html` (tuiles stat + cartes), `cash-session-detail.html` (tuiles stat). `booking-form.html` (2 champs côte à côte) passé en `auto-fit, minmax(min(220px, 100%), 1fr)`. `event-detail.html` (ligne Date/Heure/Supprimer, 2 colonnes flexibles + 1 colonne `auto` pour le bouton) : `minmax(min(160px, 100%), 1fr)` explicite sur les 2 premières colonnes plutôt que `auto-fit` (le `auto-fit` ne cohabite pas bien avec une piste `auto` de taille fixe en fin de grille).
- **Vérifié à 375px** (capture d'écran + `document.documentElement.scrollWidth > clientWidth` évalué à `false` dans la page réelle) : plus aucun débordement horizontal de page. Chaque carte contenant un tableau plus large qu'elle scrolle désormais **en interne** (voir filet de sécurité ci-dessous) plutôt que de casser la mise en page — comportement voulu, pas un défaut résiduel.

### Filet de sécurité générique : tables + `.card-header`

- `.card-body:has(> .table) { overflow-x: auto; }` (erp-app uniquement, seule app à utiliser `<table>`) — toute table plus large que sa carte scrolle horizontalement à l'intérieur de la carte au lieu de déborder de la page.
- `.card-header { flex-wrap: wrap; }` sous 640px, dans les 3 apps — un titre long + un bouton ne se chevauchent/débordent plus sur mobile.

### Clavier de connexion (`erp_kitchen_display` + `erp_validate_event`) : 4 boutons sur téléphone étroit

Après l'ajout du bouton "⇧ Maj" (voir plus haut, correction du bug majuscules), la rangée d'actions (Maj/Effacer/⌫/Se connecter) comptait 4 boutons `flex:1` sur une seule ligne — "Se connecter" se serait retrouvé écrasé sur un téléphone étroit (~70px par bouton à 375px de large). `@media (max-width: 480px)` : passe les 4 boutons en grille 2×2 (`flex: 1 1 calc(50% - gap/2)`). **Vérifié par capture d'écran à 375px** : les 4 boutons tiennent confortablement en 2×2, clavier bien en minuscules (cohérent avec la correction précédente).

### Méthode

Toutes les corrections de ce tour ont été vérifiées **empiriquement** (Playwright/Chromium réel, captures à plusieurs largeurs + vérification programmatique de l'absence de débordement horizontal), pas seulement par compilation — leçon tirée de la saga overflow POS plus haut dans ce fichier, où plusieurs corrections "correctes en théorie" avaient échoué en pratique.

### Hors scope de ce tour

- Pas de menu hamburger / sidebar en tiroir plein écran pour `erp-app` sous ~480px (téléphone) — la sidebar reste en mode icônes (76px) à toutes les largeurs sous 900px plutôt que de se masquer entièrement. Fonctionnel mais pas optimal sur un vrai téléphone ; un vrai menu "off-canvas" serait une fonctionnalité à part entière (nouvel état, animation, overlay), pas juste un ajustement de style.
- Pas d'audit exhaustif page par page des 3 apps (des dizaines de pages) — priorité donnée aux patterns **globaux** (styles.css partagé, grilles inline répétées) qui se répercutent automatiquement partout, plutôt qu'à une revue composant par composant.

## Ticket de caisse imprimable : refonte façon "vrai" reçu (2026-07-30)

Demande accompagnée d'une image de référence (un vrai ticket de caisse "MYKOMELA") pour inspirer la mise en page — structure reprise, **pas le contenu** : pas de logo/enseigne/adresse inventés, ce projet n'a aucune donnée de configuration "restaurant" (nom, adresse, siège) à afficher honnêtement sur un document qui ressemble à une pièce commerciale réelle.

- `order-builder.html` (écran de confirmation post-paiement, `.ticket-print`) réécrit : en-tête "ERPv2" centré, "Ticket n°{id} du {date} - {heure}", table, "CLIENT : {nom}" ou "CLIENT COMPTANT" si aucun client. Tableau Article/Qté/Prix (colonnes alignées à droite, `.ticket-receipt__row` en `display:grid`). "Nombre d'articles" + "Total TTC". "Règlement" avec le détail par moyen de paiement. **Nouveau** : tableau de répartition HT/Taux/TVA/TTC en pied de ticket, un ligne par taux de TVA distinct parmi les produits vendus.
- `order-builder.ts` : `ticketArticleCount()` (somme des quantités), `ticketTaxBreakdown()` (regroupe les lignes par taux de TVA du produit, calcule HT = TTC / (1 + taux/100) — même principe d'extraction que `pos-vente.ts::vatTotal`, le prix produit est TTC, la TVA s'en extrait plutôt que de s'y ajouter), `formatTicketDate()` (format `JJ/MM/AAAA - HH:MM`).
- `OrderController::pay` : eager-load étendu de `sections.lines.product` à `sections.lines.product.tax` — nécessaire pour calculer la répartition, absent jusqu'ici (jamais utilisé par l'ancienne vue ticket, plus basique).
- `order-builder.css` : nouvelles classes `.ticket-receipt__*` scopées au composant (pas globales — `pos-vente` n'a pas encore d'écran de confirmation post-paiement équivalent, voir "hors scope" plus haut dans ce fichier).
- **Vérifié en conditions réelles** (pas juste en théorie) : commande créée et payée de bout en bout via un vrai navigateur (Playwright), capture d'écran confirmant le rendu — en-tête, ticket n°/date/table, tableau articles, total, règlement, et répartition HT/TVA correcte (18.18 € HT + 1.82 € TVA = 20.00 € TTC à 10%, calcul exact).

## Correction : "marquer prête" ne concerne plus que les produits du poste/passe filtré (2026-07-30)

Retour utilisateur : "quand il y a une table avec plusieurs produits, uniquement les produits de son propre poste et de son propre passe [doivent être concernés] ; là quand on marque comme fait, ça le fait pour tous les produits de la table/section". Bug réel : `OrderSectionController::marquerFait` marquait toute la SECTION comme faite (`state: 'do'`), alors qu'une section peut mélanger des produits de plusieurs stations (ex. une entrée froide + un plat chaud dans la même section) — un poste qui finissait son propre produit marquait à tort le produit d'un AUTRE poste, pas encore préparé, comme faite lui aussi.

### Backend

- Migration `add_done_to_order_lines_table` : nouvelle colonne `order_lines.done` (booléen, défaut `false`) — le suivi de préparation passe de la section entière à la ligne individuelle.
- `OrderLine` : `done` volontairement **hors** `#[Fillable]` — ne se modifie que via `forceFill()` dans `OrderSectionController::marquerFait`, jamais par mass-assignment générique depuis `OrderLineController` (POS - Restaurant, sélection de produits — aucun rapport avec le suivi cuisine).
- `OrderSectionController::marquerFait(Request $request, OrderSection $orderSection)` : accepte désormais un `line_ids` optionnel. Fourni → ne marque `done=true` que ces lignes précises. Omis (vue "Tout") → marque toutes les lignes de la section, comportement équivalent à avant pour une section mono-poste. La section elle-même ne passe à `'do'` (état affiché "Prête") que lorsque **toutes** ses lignes sont `done=true`, indépendamment de l'appel qui vient d'avoir lieu.
- **Vérifié via `curl`** : section à 2 lignes (Viande + Poisson), `marquer-fait` avec `line_ids=[ligne Viande]` → section reste `ask` (Demandée), ligne Viande `done=true`, ligne Poisson `done=false` ; second appel avec `line_ids=[ligne Poisson]` → section passe à `do` (toutes les lignes faites).

### `erp_kitchen_display`

- `OrderLine.done` ajouté au modèle front.
- `OrderSectionService::marquerFait(sectionId, lineIds?)` — transmet `line_ids` au backend.
- `kitchen-board.ts` : `canMarkDone`/`markDone` opèrent maintenant sur la `DisplaySection` (lignes déjà filtrées par le poste/passe actif dans `displayOrders`), plus sur l'`OrderSection` brute — envoient systématiquement `Array.from(displaySection.lineIds)` (dans la vue "Tout", cet ensemble contient déjà toutes les lignes, donc aucune branche séparée nécessaire). Le bouton "Marquer prête" ne reste actif que s'il reste, **parmi les lignes visibles dans le filtre courant**, au moins une ligne pas encore faite.
- Affichage : une ligne déjà marquée faite s'affiche barrée avec un ✓ (`.kitchen-card__line--done`), pour un retour visuel immédiat sur la progression partielle d'une section multi-postes.
- **Vérifié en conditions réelles** (Playwright, pas juste en théorie) : section à 2 produits (Viande + Poisson) → filtre "Viande" → "Marquer prête" ne coche que le Burger (Viande), le bouton disparaît de cette vue (plus rien à y faire), la section reste "Demandée" → vue "Tout" confirme que le Saumon (Poisson) est toujours en attente avec son propre bouton "Marquer prête" disponible.

## Correction : "Envoyer" ne concerne plus que les produits du passe filtré (2026-07-30)

Même bug que la correction précédente ("marquer prête"), signalé cette fois pour "Envoyer" : "pour les passes aussi, quand je valide dans un passe ça valide dans les deux pour la même table et la même section". Une section peut avoir des lignes réparties sur deux passes différents (stations différentes partageant chacune un passe distinct, voir `stations.passe_id`) — "Envoyer" depuis un passe marquait toute la section comme expédiée, y compris les produits destinés à l'AUTRE passe.

### Backend

- Migration `add_sent_to_order_lines_table` : nouvelle colonne `order_lines.sent` (booléen, défaut `false`) — même principe que `done` (voir correction précédente), suivi par ligne plutôt que par section entière. `sent` également hors `#[Fillable]`, ne se modifie que via `forceFill()`.
- `OrderSectionController::envoyer(Request $request, OrderSection $orderSection)` : accepte désormais `line_ids` (même contrat que `marquerFait`). Fourni → ne marque `sent=true` que ces lignes. Omis → toutes les lignes. La section ne passe à `'seed'` que lorsque **toutes** ses lignes sont envoyées. Le garde-fou `state !== 'do'` reste inchangé (la section entière doit déjà être entièrement préparée avant que quiconque puisse commencer à l'envoyer — cohérent, puisque `'do'` lui-même n'est atteint qu'une fois toutes les lignes `done`, donc par construction déjà prêtes pour les deux passes au moment où "Envoyer" devient possible).
- **Vérifié via `curl`** : section à 2 lignes (Viande→Passe Cuisine, Bar→Passe Bar), toutes deux `done`, section `do`. `envoyer` avec `line_ids=[ligne Viande]` → section reste `do`, ligne Viande `sent=true`, ligne Bar `sent=false`. Second appel avec `line_ids=[ligne Bar]` → section passe à `seed`.

### `erp_kitchen_display`

- `OrderLine.sent` ajouté au modèle front.
- `OrderSectionService::envoyer(sectionId, lineIds?)` — transmet `line_ids`.
- `kitchen-board.ts` : `canSend`/`send` opèrent maintenant sur la `DisplaySection` (lignes déjà filtrées par le passe actif), même principe que `canMarkDone`/`markDone` — le bouton "Envoyer" ne reste actif que s'il reste, parmi les lignes visibles dans le filtre courant, au moins une ligne pas encore envoyée.
- Affichage : une ligne envoyée affiche `✓✓` (double coche, distinct du simple `✓` de "faite" mais pas encore envoyée).
- **Vérifié en conditions réelles** (Playwright) : section à 2 produits (Viande→Passe Cuisine, Bar→Passe Bar) → filtre "Passe Cuisine" → "Envoyer" n'expédie que le Burger, le bouton disparaît de cette vue, la section reste "Prête" → vue "Tout" confirme que la Bière (Passe Bar) reste à envoyer avec son propre bouton "Envoyer" disponible.

## Séparation stricte des rôles : postes ↔ "Marquer prête", passes ↔ "Envoyer" (2026-07-30)

Retour utilisateur : "il n'y a que les stations qui peuvent marquer prête, pas les passes ; les passes ne peuvent qu'envoyer". Jusqu'ici, `canMarkDone`/`canSend` ne dépendaient que de l'état de la section et des lignes visibles dans le filtre courant — les deux boutons pouvaient apparaître quel que soit le type de filtre actif (poste, passe, ou même "Tout"), sans respecter de séparation des rôles.

- `kitchen-board.ts` : nouveau `isPassePerspective` (computed, symétrique de `isStationPerspective` déjà existant) — vrai pour un passe précis ou "Tous les passes".
- `canMarkDone` : ajoute `!this.isStationPerspective()` en garde — n'apparaît plus que depuis la perspective "Postes".
- `canSend` : ajoute `!this.isPassePerspective()` en garde — n'apparaît plus que depuis la perspective "Passes".
- Conséquence assumée : depuis "Tout" (supervision globale, aucune perspective précise), **aucune des deux actions n'est proposée** — un écran de vue d'ensemble n'est pas un poste de travail, l'action se prend depuis l'écran du rôle concerné (poste ou passe).
- **Vérifié en conditions réelles** (Playwright) : filtre "Passe Bar" → seul "Envoyer" est proposé, jamais "Marquer prête", même sur une section entièrement prête. Filtre "Bar" (poste) sur cette même section déjà `do` → aucune carte affichée (cohérent avec la règle déjà en place "section prête retirée de la vue Poste", rien à y faire une fois le poste terminé).

## Bug corrigé : nouvelle section invisible sur le kitchen display après qu'une commande soit déjà "seed" (2026-07-30)

Signalé dans Readme.md : "quand j'ajoute une section dans POS - Restaurant et que je valide, ça n'envoie pas dans kitchen display". Cause confirmée avec de vraies données de session (l'utilisateur avait justement cette situation en base au moment du diagnostic) : la visibilité d'une commande sur le kitchen display se basait sur `order.state !== 'seed'` — or `orders.state` passe à `'seed'` une fois que **toutes les sections existantes au moment de l'envoi** sont envoyées, mais rien ne "rouvre" cet état si on ajoute une **nouvelle** section après coup (la table reste occupée, une commande peut recevoir de nouvelles sections à tout moment, ex. un dessert commandé après l'envoi du plat principal). Résultat : la commande entière — nouvelle section comprise — restait invisible sur le kitchen display.

- `kitchen-board.ts` (`displayOrders`) : suppression complète de la dépendance à `order.state` pour la visibilité. La logique se base désormais uniquement sur les **sections** elles-mêmes : une section `'seed'`/`'done'` a fini tout son cycle kitchen display et disparaît de **toutes** les vues (pas seulement "Postes" comme avant) ; une commande disparaît simplement parce qu'il ne lui reste plus aucune section à afficher (dernier `.filter` de la chaîne, déjà existant). Le computed `openOrders` (devenu inutile) est supprimé.
- **Vérifié en conditions réelles** : reproduit le bug exact via `curl` (commande avec une 1ʳᵉ section envoyée intégralement → `order.state` reste `'seed'` → ajout et validation d'une 2ᵉ section → `order.state` toujours `'seed'`, comme avant la correction), puis confirmé via un vrai navigateur que le kitchen display affiche désormais correctement la nouvelle section ("Table 2 / Section 2 / Validée"), tout en gardant la section déjà envoyée cachée comme prévu.

## Nouvelle section "Gestion des tickets" — historique + réimpression (2026-07-30)

Demandé dans Readme.md : "ajout d'une section -> gestion des tickets, historique des tickets -> possibilité de réimpression de ticket (pas de modification et de suppression)". Un ticket payé est une pièce comptable figée — page volontairement en lecture seule : ni édition, ni suppression, uniquement consultation et réimpression.

- **Refactor préalable** : la logique du reçu (total, répartition HT/Taux/TVA/TTC, formatage date, nombre d'articles), jusqu'ici propre à `order-builder.ts` (écran de confirmation post-paiement POS - Restaurant), extraite dans `core/ticket-print.util.ts` (fonctions pures, pas de service Angular) — maintenant réutilisée par les deux écrans plutôt que dupliquée. Les méthodes de `order-builder.ts` sont remplacées par des propriétés `readonly` pointant directement vers les fonctions importées (`readonly formatMoney = formatMoney;` etc.) — évite de réécrire des méthodes wrapper, le template n'a pas eu besoin de changer.
- Les classes CSS `.ticket-receipt__*` (mise en page du reçu) déplacées de `order-builder.css` (scopé) vers `styles.css` global, pour la même raison — deux composants les utilisent désormais.
- **Backend** : `TicketController::WITH` étendu (`sections.lines.product.tax`, `table`) — nécessaire pour la répartition TVA et l'affichage de la table, absent jusqu'ici car la vue ticket d'origine était plus sommaire.
- **`pages/tickets/ticket-list`** (nouveau, route `/tickets`, nav "🧾 Gestion des tickets" entre Fond de caisse et Gestion des produits) : liste tous les tickets (`TicketService.list(1000)` — pas de pagination côté backend, comme les autres listes de ce projet), avec filtre par jour (`<app-date-picker>`, même pattern que `cash-register-home`) et par nom de client. Chaque ligne affiche ticket #, date/heure, table (si POS Restaurant), client (ou "Client comptant"), moyens de paiement, total, et un seul bouton **"🖨️ Réimprimer"** — aucune action de modification ou suppression, conformément à la demande.
- Réimpression : clique sur une ligne → affiche le même bloc `.ticket-print.ticket-receipt` que l'écran de paiement POS Restaurant (section/lignes/total/règlement/TVA) → déclenche `window.print()` après un court délai (laisse Angular peindre le bloc avant l'ouverture de la boîte de dialogue).
- **Vérifié en conditions réelles** : liste chargée avec 36 tickets réels (accumulés pendant cette session, POS Vente directe et POS Restaurant confondus) correctement affichés avec toutes leurs colonnes ; réimpression testée sur un vrai ticket à 2 sections/2 taux de TVA différents/paiement split espèces+carte — répartition HT/TVA affichée correctement (8.18€ HT + 0.82€ TVA = 9.00€ à 10% ; 10.00€ HT + 2.00€ TVA = 12.00€ à 20%). Build Angular propre (`docker logs erp_v2_app`).

## Ajout : détail d'un ticket, `/tickets/:id` (2026-07-30)

Suite à "Gestion des tickets" ci-dessus : "tu peux ajouter voir le detail du ticket /ticket". Même principe de lecture seule — un ticket payé ne s'édite ni ne se supprime, uniquement consultation et réimpression depuis l'écran de détail lui-même.

- **Backend** : `TicketController::show(Ticket $ticket)` + route `GET tickets/{ticket}`, réutilise le même eager-loading (`WITH`) que `index()`.
- `TicketService.get(id)` ajouté (`core/ticket.service.ts`).
- **`pages/tickets/ticket-detail`** (nouveau, route enfant `tickets/:id` — la route `tickets` est passée d'une entrée simple à un `children: [{path:'', ...TicketList}, {path:':id', ...TicketDetail}]`) : résumé (date, table, client, moyen de paiement, total) + le même reçu `<app-ticket-receipt>` que les autres écrans, toujours visible (pas seulement à l'impression) avec un bouton "🖨️ Réimprimer" qui appelle directement `window.print()`. `ticket-list.html` : la colonne `#id` et un nouveau bouton "Voir" pointent vers `[routerLink]="[ticket.id]"`.
- **Troisième consommateur du composant partagé `TicketReceipt`** (après `order-builder` et `ticket-list`) → **bug réel trouvé et corrigé à cette occasion** : l'élément custom `<app-ticket-receipt>` n'a par défaut aucun `display` (donc `inline` — comportement standard des custom elements non stylés), ce qui rendait `max-width`/`margin` posés par chaque consommateur silencieusement sans effet (un élément inline ignore `max-width`). Invisible en `ticket-list`/`order-builder` car le bloc n'y est affiché que pendant l'impression (jamais vu à l'écran), mais flagrant en `ticket-detail` où le reçu est affiché en continu — repéré via Playwright (`getComputedStyle` : `display: inline`, largeur réelle 956px au lieu des 380px demandés). Corrigé une fois pour toutes dans le composant partagé (`host: { style: 'display: block' }` sur `TicketReceipt`) plutôt que dans chaque consommateur — élimine le bug pour les 3 usages, y compris les 2 qui ne l'avaient pas encore remarqué visuellement.
- **Vérifié en conditions réelles** (Playwright, connecté en admin) : navigation `/tickets` → clic "Voir" → `/tickets/36` → reçu affiché à la bonne largeur (380px, capturé avant/après le fix `display: block`), aucune erreur console/page. Liste et réimpression toujours correctes après le fix. `npx tsc --noEmit` propre, build Angular propre.

## Synchronisation temps réel entre instances de POS - Restaurant (2026-07-30)

Demandé dans Readme.md : "synchroniser les différentes instances de POS - Restaurant quand une table est ouverte ou payée (fait via Laravel Echo/Reverb, même mécanisme que kitchen display). Quand on ouvre une table et à chaque modification de table, de paiement, ajout de produit, tout synchroniser." Jusqu'ici le canal Reverb "kitchen"/`OrderKitchenUpdated` n'était diffusé que pour les transitions pertinentes à la cuisine (section validée/demandée/faite/envoyée, commande payée/annulée) — table-select.ts n'écoutait rien du tout, et order-builder.ts ne réagissait qu'aux événements cuisine.

### Backend

- **`OrderKitchenUpdated`** (docblock mis à jour) : diffusé désormais à chaque mutation d'une Order, pas seulement les transitions cuisine — deux familles d'abonnés distinctes sur le même canal public "kitchen" (kitchen-board.ts ne lit que les transitions qui le concernent en pratique, mais tolère très bien de recevoir aussi les autres puisqu'il ne fait qu'un refetch générique sans lire le payload).
- Nouveaux points de diffusion ajoutés : `OrderController::store` (table ouverte), `OrderLineController::store/update/destroy` (produit ajouté/quantité modifiée/retiré), `OrderSectionController::store/destroy` (section créée/supprimée). Déjà existants et inchangés : `valider`/`demander`/`marquerFait`/`envoyer` (section), `OrderController::pay`/`destroy`.
- **Piège rencontré** : contrairement aux 3 apps front (`erp-app`, `erp_kitchen_display`, `erp_validate_event`) qui sont bind-mountées (`ng serve --poll` recharge à chaud), `erp-api` n'a **aucun bind mount** dans `docker-compose.yml` — le code est cuit dans l'image au `docker build`. Toutes les modifications PHP de cette session sont restées sans effet dans le conteneur tournant jusqu'à `docker compose build api reverb && docker compose up -d api reverb` (les deux services partagent la même image). Auto-détecté car un premier test Playwright "réussissait" un scénario qui n'aurait pas dû fonctionner avec l'ancien code — indice qu'il fallait vérifier la propagation réelle du changement avant de faire confiance au résultat du test (voir plus bas).

### `erp-app`

- **`table-select.ts`** : nouvel abonnement au canal "kitchen" (`KitchenEchoService`, déjà utilisé par order-builder.ts) — sur TOUT événement reçu (ignore le payload `orderId`), refetch de la liste complète des commandes (`refreshOrders()`), même pattern que kitchen-board.ts côté erp_kitchen_display. Une table ouverte/libérée depuis une AUTRE instance se reflète donc immédiatement, sans rechargement manuel.
- **`order-builder.ts`** : le filtre existant (`orderId === this.orderId`) suffisait déjà pour bénéficier des nouveaux points de diffusion sans changement de logique — mais **bug réel découvert et corrigé pendant la vérification** (race condition) :
  - Un premier garde-fou (`!this.paidTicket()`) a été ajouté pour éviter qu'une instance qui vient ELLE-MÊME de payer ne se refetch sur son propre broadcast (la commande vient d'être supprimée côté serveur → 404 → sans garde-fou, `refreshOrder()` échouait et (après le fix suivant) quittait l'écran de reçu avant même qu'il ait pu s'afficher).
  - **Insuffisant en pratique** : `ShouldBroadcastNow` diffuse de façon synchrone PENDANT le traitement de la requête HTTP de paiement côté serveur — le message WebSocket peut donc concrètement arriver au navigateur AVANT la réponse HTTP de ce même paiement (deux allers-retours réseau distincts, sans garantie d'ordre). À ce moment-là, `paidTicket()` n'est pas encore posé (il ne l'est que dans le callback `next` de la réponse HTTP), donc le garde-fou seul laissait passer un refetch intempestif qui faisait quitter l'écran de reçu juste après un paiement RÉUSSI — reproduit à 100% en Playwright avant correction. Corrigé en étendant le garde à `!this.paying() && !this.paidTicket()` — `paying` est posé à `true` de façon synchrone dès le tout début de `submitPayment()`, donc couvre toute la fenêtre, y compris avant que la réponse HTTP ne revienne.
  - `refreshOrder()` : une erreur 404 (commande introuvable — payée ou annulée depuis une AUTRE instance) redirige désormais vers la sélection de table (`goToTableSelect()`) plutôt que d'afficher un message d'erreur bloquant qui n'a plus de sens (la commande n'existe simplement plus).
- **`KitchenEchoService`** (docblock mis à jour) : décrit désormais les deux usages distincts (table-select vs order-builder) et le fait que le canal porte maintenant toutes les mutations, pas seulement les transitions cuisine.

### Vérifié en conditions réelles (Playwright, plusieurs contextes de navigateur simultanés)

- **Table ouverte** : page1 ouvre une table libre → page2 (déjà sur `/pos-restaurant`, sans rien recharger) voit la table passer à "Occupée" en direct.
- **Produit ajouté** : page1 et page2 ouvrent la MÊME commande (deux instances sur le même order-builder) → produit ajouté sur page1 → apparaît sur page2 sans rechargement.
- **Commande annulée** : page1 annule → une page3 déjà sur l'écran de la commande annulée rebascule automatiquement vers la sélection de table (pas de message d'erreur bloquant) ; une autre instance sur table-select voit la table redevenir libre en direct.
- **Paiement** (scénario complet piloté par `curl` jusqu'à `state=seed`, paiement fait via l'UI réelle) : après correction de la race condition — l'instance qui paie reste sur `/pos-restaurant/{id}` et affiche correctement le reçu ("Ticket #41 payé ✅") ; une seconde instance ouverte sur la même commande rebascule proprement vers la sélection de table, sans erreur affichée.
- Avant la 1ʳᵉ tentative de vérification, un premier essai avait donné un faux positif sur "produit ajouté" — dû à un rebuild concurrent d'`erp-app` (`ng serve --poll`) qui a déclenché un rechargement complet de la page de test (HMR "Page reload sent to client(s)"), masquant le fait que le code backend n'était pourtant pas encore rebuild. Levé en s'assurant qu'aucun rebuild front n'était en cours pendant la vérification, et en confirmant d'abord par `docker exec` que le code PHP dans le conteneur correspondait bien au fichier source avant de refaire tourner les tests.

## Suppression remplacée par une désactivation (`active`) — rooms/tables/catégories/catalogues/utilisateurs/rôles/stations/taxes/passes (2026-07-30)

Demandé dans Readme.md : "ne plus avoir la possibilité de supprimer, juste supprimer les boutons supprimer (trop compliqué pour le delete on cascade), mais ajouter un champ active (default true), possibilité de l'activer ou non ; mettre à jour les composants pour n'afficher que les éléments actifs" — pour Tables et Salles, Catégories, Catalogues, Utilisateurs, Rôles, Stations et Taxes (Produits et Passes hors périmètre initial ; Passes ajouté ensuite sur demande explicite du même jour, même traitement). Produits avait déjà exactement ce pattern (`products.active`, ajouté avant cette session) — servi de référence directe.

### Backend

- 9 migrations `add_active_to_*_table` (rooms, tables, product_categories, product_catalogs, users, roles, stations, taxes, passes) : `$table->boolean('active')->default(true)`. Toutes les lignes existantes deviennent `active=true` par défaut (backfill implicite du `default`), aucune ne se retrouve masquée après coup.
- `product_catalogs.active` est **distinct** de `active_restaurant`/`active_direct_sale` déjà existants (voir migration `create_product_catalogs_table`) : ceux-là choisissent lequel des catalogues actifs est affiché par contexte POS, `active` détermine juste si le catalogue existe/est utilisable du tout.
- 9 modèles : `active` ajouté au `#[Fillable]` + `casts()` (`'active' => 'boolean'`).
- 9 contrôleurs (`RoomController`, `TableElementController`, `ProductCategoryController`, `ProductCatalogController`, `UserController`, `RoleController`, `StationController`, `TaxController`, `PasseController`) : méthode `destroy()` retirée entièrement, `active` ajouté aux règles de validation `store`/`update`.
- `routes/api.php` : `->except(['destroy'])` ajouté sur les `Route::apiResource(...)` correspondantes (y compris `rooms.tables` malgré le `->shallow()`). Vérifié via `php artisan route:list` : les routes `DELETE` ont bien disparu (ex. `stations` passe de 5 routes à 4).
- **Piège rencontré** : `erp-api` (contrairement aux 3 apps Angular) n'a **aucun bind mount** dans `docker-compose.yml` — modifier les fichiers PHP ne suffit pas, il faut `docker compose build api reverb && docker compose up -d api reverb` pour que le code tourne réellement dans le conteneur (déjà rencontré et documenté dans la section "Synchronisation temps réel" ci-dessus, reconfirmé ici). `php artisan migrate` derrière renvoie "Nothing to migrate" car `docker/entrypoint.sh` l'exécute déjà automatiquement au démarrage du conteneur — c'est normal, pas un signe d'échec.

### Frontend — pages `Paramètres`

- 8 interfaces TS (`Room`, `TableElement`, `ProductCategory`, `ProductCatalog`, `Station`, `Tax`, `Role`, `User`, `Passe`) : `active: boolean` ajouté. Dupliqué aussi dans `erp_validate_event/core/models/event.model.ts` (`TableElement`) — cette app a sa propre copie du modèle, pas de code partagé entre apps Angular dans ce projet.
- 8 pages de liste (`room-list`, `category-list`, `catalog-list`, `user-list`, `role-list`, `station-list`, `tax-list`, `passe-list`) : bouton "Supprimer" retiré, remplacé par une colonne "Statut" avec badge `Actif`/`Inactif` — **même pattern visuel que `product-list.html`**, qui avait déjà ce badge (mais pas de toggle direct dans la liste : le statut se change depuis le formulaire, pas la liste, cohérent avec l'existant).
- `floor-plan-editor` (édition des tables d'une salle) : bouton "Supprimer" remplacé par une case "Table active" dans le panneau de propriétés de la table sélectionnée (`toggleActive()`, persiste immédiatement). Une table inactive reste visible et éditable sur le plan mais s'affiche estompée (`opacity: 0.4`, bordure en pointillés, classe `.is-inactive`) pour signaler qu'elle a disparu des écrans de consultation (POS - Restaurant, event-checkin, event-dashboard).
- 8 pages de formulaire (`room-form`, `category-form`, `catalog-form`, `user-form`, `role-form`, `station-form`, `tax-form`, `passe-form`) : case à cocher "Actif" ajoutée (signal `active`, défaut `true` pour une création, chargé depuis l'entité en édition), incluse dans le payload `submit()`.

### Frontend — composants consommateurs filtrés sur `active`

"Mettre à jour les composants pour n'afficher que les éléments actifs" — chaque endroit qui liste ou propose ces entités à la sélection a été revu :
- `table-select.ts` (POS - Restaurant) : `restaurantRooms`/`tables` filtrent désormais aussi sur `.active` (en plus du filtre `type === 'restaurant'` déjà existant).
- `event-dashboard.ts` (erp-app) et `event-checkin.ts` (erp_validate_event) : `tables` filtre sur `.active`.
- `event-detail.ts` : `eventRooms` (sélecteur de salle à la création/édition d'une date d'événement) filtre sur `.active` en plus de `type === 'event'`.
- `event-list.ts` : **volontairement non filtré** — son usage de `rooms()` sert à faire correspondre un nom de salle importé (CSV) à un id, pas à peupler un `<select>` ; filtrer aurait cassé la résolution d'imports référençant une salle par ailleurs désactivée.
- `product-form.ts` : `selectableCategories`/`selectableCatalogs`/`selectableStations`/`selectableTaxes` (nouveaux `computed`) remplacent les signaux bruts dans le template — filtrent sur `.active`, **sauf** l'option déjà sélectionnée sur CE produit (`|| x.id === selectedId()`, ou `|| ids().includes(x.id)` pour les catalogues en multi-sélection) : évite qu'enregistrer un produit existant sans y toucher ne détache silencieusement une catégorie/catalogue/station/taxe désactivée entretemps (le `<select>` ne montrerait plus l'option correspondante, donc plus rien coché).
- `user-form.ts` : même principe pour `selectableRoles` (checkboxes multi-sélection) — un rôle déjà attribué reste visible même désactivé.
- `station-form.ts` : `selectablePasses`, même principe pour le passe déjà choisi.
- `cash-register-home.ts` : **deux usages distincts de la liste d'utilisateurs, traités différemment** — `activeUsers` (nouveau, filtré) pour "Qui êtes-vous ?" (ouvrir la caisse : un utilisateur désactivé ne doit plus pouvoir ouvrir de session) ; `users()` **non filtré** conservé pour le filtre de l'historique des sessions (une session passée peut légitimement appartenir à un utilisateur depuis désactivé — le masquer casserait le filtre sur les données historiques).
- **Vérifié en conditions réelles** (Playwright) : les 8 pages de liste Paramètres n'affichent plus aucun bouton "Supprimer" et affichent bien le badge de statut (aucune erreur console). Désactivation de la station "Dessert" depuis son formulaire → liste des stations la montre "Inactif" → dropdown "Station" de `product-form` (nouveau produit) ne propose plus que Bar/Froid/Poisson/Viande (Dessert bien absent) → réactivée pour ne pas laisser de données de test dans un état modifié.
- `npx tsc --noEmit` propre sur `erp-app` et `erp_validate_event`, build Angular propre (les deux apps sont bind-mountées, contrairement à `erp-api`).
