# CONTEXTE — ERP v2 (restaurant / snack / vente directe)

> Doc vivante à lire en premier en reprenant le projet, sur le modèle de `ERP/CONTEXT.md` (le repo `ERP/` original, conservé tel quel à côté). Mise à jour au fil de l'eau.

## Vue d'ensemble

Repartir de zéro sur un ERP restaurant/snack/vente directe, avec le schéma de données esquissé dans `Readme.md` comme point de départ (au lieu de faire évoluer le modèle de données de `ERP/`, jugé trop contraint par son historique). Même stack, même conventions Docker que `ERP/` — voir [[project-erp-overview]] pour comparaison.

| Dossier | Rôle | Stack |
|---|---|---|
| `erp-api/` | API backend | Laravel 13, PHP 8.4, MySQL 8.4 |
| `erp-app/` | App principale (à construire) | Angular 21, standalone, zoneless par défaut (pas de zone.js dans les dépendances) |

Trois dépôts indépendants (pas de kitchen-display pour l'instant, contrairement à `ERP/` — pas demandé, à ajouter plus tard si besoin).

## Démarrage rapide

```bash
cp .env.example .env   # déjà fait, .env versionné localement avec une APP_KEY générée
docker compose up --build
```

| Service | URL |
|---|---|
| App principale | http://localhost:19002 |
| API | http://localhost:19001 |
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
