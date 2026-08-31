# Première configuration — que créer, dans quel ordre

Une fois l'app installée (`docker compose up -d --build` ou l'équivalent prod, voir
[`deploy-ovh.md`](deploy-ovh.md)), les seeders de base ont déjà créé de quoi démarrer : rôles,
compte admin, TVA belge, 2 stations (Cuisine/Bar), 7 catégories, 3 catalogues vides, 4 moyens de
paiement, quelques réglages. **Rien de tout ça ne contient encore un seul produit.** L'ordre
ci-dessous suit les dépendances réelles — chaque étape a besoin que la précédente existe déjà, pas
l'inverse. Tout se fait depuis `erp-app`, menus **Paramètres** et **Gestion**.

## 1. Comptes du personnel

`Paramètres → Utilisateurs` / `Paramètres → Rôles`

Le seul compte qui existe est `admin` (voir `ADMIN_USERNAME`/`ADMIN_PASSWORD` dans `.env`) —
changez son mot de passe en premier, puis créez un compte par membre du personnel avec le bon
rôle (`Administrateur` / `Superviseur` / `Utilisateur`, voir `docs/README.md` pour ce que chaque
rôle autorise). Personne d'autre ne devrait travailler sous le compte `admin` partagé.

## 2. Stations & passes cuisine

`Paramètres → Stations` / `Paramètres → Passes`

Déjà créées : **Cuisine** et **Bar**, chacune avec sa passe (point d'expédition sur le kitchen
display). Ajoutez-en d'autres si votre cuisine a plus de postes de préparation (ex. Pâtisserie,
Plancha, Sushi) — chaque produit sera rattaché à une station, qui détermine sur quel écran cuisine
sa ligne de commande apparaît.

## 3. Taxes (TVA)

`Paramètres → Taxes`

Déjà créées : 21 % / 12 % / 6 % / 0 % (taux belges). Vérifiez qu'ils correspondent à votre
comptabilité — chaque produit devra pointer vers l'un d'eux.

## 4. Catégories de produits

`Paramètres → Catégories`

Déjà créées : Entrées, Plats, Desserts, Boissons chaudes, Boissons froides, Vins & Bières,
Snacking (chacune avec un emoji par défaut). Renommez, supprimez ou ajoutez-en selon votre carte —
une catégorie peut avoir une vraie image à la place de l'emoji.

## 5. Catalogues

`Paramètres → Catalogues`

Déjà créés : **Catalogue de base** (actif pour POS Restaurant et Vente directe), **Catalogue
weekend**, **Boissons**. Un produit peut appartenir à plusieurs catalogues à la fois, et chaque
contexte (POS Restaurant, Vente directe, Kiosque, Self-order, Boutique en ligne) affiche l'union
des catalogues actifs pour lui — décidez ici quel catalogue sert quel canal avant de créer vos
produits, pour les y assigner directement.

## 6. Ingrédients (si des produits sont personnalisables)

`Paramètres → Ingrédients`

Optionnel, à faire avant l'étape Produits si vous voulez proposer "sans oignon"/"sans fromage" au
comptoir ou en ligne — un ingrédient est ensuite rattaché à un produit avec un indicateur
retirable ou non.

## 7. Produits

`Gestion → Produits`

**L'étape principale.** Chaque produit a besoin d'une taxe, d'une station et (généralement) d'une
catégorie déjà créées — d'où l'ordre ci-dessus. Pour chacun : nom, prix, TVA, station, catégorie,
catalogue(s), icône ou image, ingrédients retirables si applicable, suivi de stock si souhaité
(laisser vide = stock illimité, jamais décompté).

## 8. Menus / formules (optionnel)

Une fois les produits de base créés, un produit peut être marqué "menu" et composé d'un ou
plusieurs groupes de choix (ex. "Plat au choix" + "Boisson au choix") — chaque option d'un groupe
doit déjà exister comme produit normal. Impossible avant l'étape 7.

## 9. Plan de salle

`Paramètres → Tables & salles`

Complètement vide au départ. Créez une salle, placez ses tables sur le plan (glisser-déposer) —
nécessaire pour le POS Restaurant (ouverture de table) et pour générer les QR codes de
`erp_self_order` (un QR par table, imprimable depuis cette page).

## 10. Imprimantes thermiques (si vous en avez)

`Paramètres → Imprimantes`

Une imprimante réseau par poste physique (ex. "Caisse bar", "Kiosque 1") — nom, IP, port. Sans
imprimante configurée ici et sans `PRINTER_HOST` dans `.env`, l'impression thermique reste
indisponible mais l'impression navigateur (aperçu + `Ctrl+P`) fonctionne sans rien configurer.
Chaque poste choisit ensuite son imprimante dans le sélecteur en bas de la barre latérale.

## 11. Moyens de paiement

Pas de page `Paramètres` dédiée — fixés par seeder : **Espèces, Bancontact, QR Code, Boutique en
ligne**. QR Code et Boutique en ligne ne servent qu'aux paiements Stripe réels (kiosque / boutique
en ligne) — sans clés Stripe configurées (`STRIPE_KEY`/`STRIPE_SECRET` dans `.env`), ces deux-là
resteront inertes.

## 12. Réglages génériques

`Paramètres → Réglages`

Déjà seedés avec des valeurs à vérifier/adapter avant l'ouverture :

| Clé | Valeur par défaut | À faire |
| --- | --- | --- |
| `shop_address` | *Rue de Plainevaux 96, 4100 Seraing* | **À changer** — c'est un exemple, pas votre adresse |
| `shop_delivery_fee` | 5.00 € | Ajuster à votre tarif réel |
| `shop_delivery_radius_km` | 5 | Ajuster à votre zone de livraison réelle |
| `self_order_open_at` / `self_order_close_at` | 10:00 / 22:00 | Vos horaires réels d'acceptation des commandes en salle |
| `kiosk_table_available` | `true` | `false` si vous ne proposez pas le choix sur place/à emporter au kiosque |

## 13. Codes promo (optionnel)

`Paramètres → Réductions`

Pourcentage, montant fixe, ou produit offert — le type "produit gratuit" a besoin qu'au moins un
produit existe déjà (étape 7).

## 14. Billetterie événements (optionnel, seulement si vous vendez des places)

`Paramètres → Types de place` puis `Gestion → Événements`

Créez d'abord vos types de place (Adulte, Étudiant, Senior…) — le tarif de chaque type se fixe
ensuite **par événement**, pas globalement, depuis la fiche de l'événement une fois celui-ci créé.

---

**Pour aller plus loin** sur ce que fait chaque section une fois configurée, voir
[`docs/README.md`](README.md). Pour le déploiement en production (domaines, secrets, certificats),
voir [`Readme.md`](../Readme.md#déploiement-en-production) et [`deploy-ovh.md`](deploy-ovh.md).
