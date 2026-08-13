<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\CashSessionController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\DiscountController;
use App\Http\Controllers\Api\EventController;
use App\Http\Controllers\Api\EventDateController;
use App\Http\Controllers\Api\EventTicketController;
use App\Http\Controllers\Api\EventTicketPriceController;
use App\Http\Controllers\Api\EventTicketTypeController;
use App\Http\Controllers\Api\IngredientController;
use App\Http\Controllers\Api\KioskCheckoutController;
use App\Http\Controllers\Api\KioskOrderController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\OrderLineController;
use App\Http\Controllers\Api\OrderSectionController;
use App\Http\Controllers\Api\ParamController;
use App\Http\Controllers\Api\PasseController;
use App\Http\Controllers\Api\PaymentMethodController;
use App\Http\Controllers\Api\PrinterController;
use App\Http\Controllers\Api\ProductCatalogController;
use App\Http\Controllers\Api\ProductCategoryController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\AccountingExportController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\RoomController;
use App\Http\Controllers\Api\SelfOrderController;
use App\Http\Controllers\Api\StationController;
use App\Http\Controllers\Api\StripeWebhookController;
use App\Http\Controllers\Api\TableElementController;
use App\Http\Controllers\Api\TaxController;
use App\Http\Controllers\Api\TicketController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;
use Laravel\Cashier\Http\Middleware\VerifyWebhookSignature;

// Authentification par token Sanctum (voir Readme.md : "mettre en place l'authentification pour
// app et validate event"). Connexion par nom d'utilisateur + mot de passe OU par scan d'un QR
// personnel (AuthController::login dispatche selon le payload) — seule route publique de l'API,
// tout le reste exige un Bearer token valide.
Route::post('auth/login', [AuthController::class, 'login']);

// Exception volontaire : servi comme <img src="..."> brut dans la fenêtre d'impression
// (event-dashboard.ts), qui ne peut pas joindre d'en-tête Authorization. Contrairement au QR de
// connexion d'un utilisateur (users/{user}/qr, lui protégé — c'est un identifiant/mot de passe),
// ce PNG ne fait que ré-encoder `validation_code`, une chaîne aléatoire déjà destinée à être
// remise au client sur son billet physique/email — l'exposer sans auth n'ouvre rien de plus que
// ce que le billet imprimé expose déjà.
Route::get('event-tickets/{event_ticket}/qr', [EventTicketController::class, 'qr']);

// erp_self_order, mode QR (voir SelfOrderController) : un client anonyme scanne un code lié à
// une table/référence et compose sa commande depuis son propre téléphone, sans jamais
// s'authentifier — `qr_token` (aléatoire, non deviné) fait office de capacité scopée à cette
// seule table, même principe que le PNG ci-dessus. Le mode kiosque, lui, est un appareil
// authentifié classique (voir routes orders/tickets plus bas), pas concerné ici.
Route::get('self-order/{qr_token}', [SelfOrderController::class, 'show']);
Route::post('self-order/{qr_token}/lines', [SelfOrderController::class, 'store']);
Route::get('tables/{table}/qr', [SelfOrderController::class, 'qr']);

// Écran public "suivi des commandes" du kiosque (voir KioskOrderController::status) — juste des
// numéros de ticket déjà remis au client, rien à protéger.
Route::get('kiosk-orders/status', [KioskOrderController::class, 'status']);

// Webhook Stripe (paiement kiosque QR/Bancontact, voir KioskCheckoutController et
// StripeWebhookController) — forcément public (appelé par Stripe, pas par un utilisateur de
// l'app), authentifié autrement : signature HMAC vérifiée par le middleware Cashier
// (STRIPE_WEBHOOK_SECRET), pas de Bearer token.
Route::post('stripe/webhook', [StripeWebhookController::class, 'handle'])->middleware(VerifyWebhookSignature::class);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('auth/me', [AuthController::class, 'me']);
    Route::get('company', [CompanyController::class, 'show']);

    // Lecture seule (voir RoleController) — les trois rôles sont fixes, plus de create/update.
    Route::apiResource('roles', RoleController::class)->only(['index', 'show']);

    // Lecture ouverte à tous les rôles authentifiés (POS en a besoin : catalogue, salles pour le
    // transfert de table, moyens de paiement...) — seules les mutations sont restreintes
    // ci-dessous (voir Readme.md, "il n'y aura que trois rôles" : admin = Paramètres complets,
    // superviseur = tout le reste sauf Paramètres, user = juste les POS).
    Route::get('product-categories', [ProductCategoryController::class, 'index']);
    Route::get('product-catalogs', [ProductCatalogController::class, 'index']);
    Route::get('products', [ProductController::class, 'index']);
    Route::get('products/{product}', [ProductController::class, 'show']);
    Route::get('rooms', [RoomController::class, 'index']);
    Route::get('rooms/{room}', [RoomController::class, 'show']);
    Route::get('rooms/{room}/tables', [TableElementController::class, 'index']);
    Route::get('stations', [StationController::class, 'index']);
    Route::get('passes', [PasseController::class, 'index']);
    Route::get('taxes', [TaxController::class, 'index']);
    Route::get('payment-methods', [PaymentMethodController::class, 'index']);
    // Chaque poste (kiosque ou POS) doit pouvoir lister les imprimantes pour choisir la sienne
    // (voir ActivePrinterService) — pas réservé à admin comme le reste de Paramètres ci-dessous,
    // même logique que product-categories/stations/taxes/payment-methods ci-dessus.
    Route::get('printers', [PrinterController::class, 'index']);
    Route::get('clients', [ClientController::class, 'index']);
    Route::post('clients', [ClientController::class, 'store']);
    // Doit être déclarée AVANT clients/{client} (sinon "lookup" serait interprété comme un id
    // par le route model binding) — voir ClientController::lookup, utilisée par le kiosque.
    Route::get('clients/lookup', [ClientController::class, 'lookup']);
    Route::get('clients/{client}', [ClientController::class, 'show']);
    // Doit être déclarée AVANT cash-sessions/{cash_session} (dans le groupe superviseur
    // ci-dessous) : sinon Laravel matche "active" comme si c'était un {cash_session} (premier
    // enregistré gagne), et ça part en 404 au lieu d'appeler ::active — voir CashSessionController.
    Route::get('cash-sessions/active', [CashSessionController::class, 'active']);

    // ---- Paramètres (admin uniquement) ----
    // ->except(['destroy']) sur product-categories/product-catalogs/users/rooms/
    // rooms.tables/stations/taxes : "ne plus avoir la possibilité de supprimer... ajouter un
    // champ active" (voir Readme.md) — le cascade delete sur ces entités très référencées était
    // jugé trop risqué, remplacé par une désactivation (update ordinaire avec active=false).
    // Passes non concernées, hors du périmètre de cette demande.
    Route::middleware('role:admin')->group(function () {
        Route::apiResource('product-categories', ProductCategoryController::class)->except(['destroy', 'index']);
        Route::post('product-categories/{product_category}/image', [ProductCategoryController::class, 'uploadImage']);
        Route::delete('product-categories/{product_category}/image', [ProductCategoryController::class, 'removeImage']);
        Route::apiResource('product-catalogs', ProductCatalogController::class)->except(['destroy', 'index']);
        // PUT + { active: bool } : chaque contexte accepte maintenant plusieurs catalogues actifs
        // à la fois (voir ProductCatalogController::setActiveForX), plus une activation exclusive.
        Route::put('product-catalogs/{product_catalog}/active-restaurant', [ProductCatalogController::class, 'setActiveForRestaurant']);
        Route::put('product-catalogs/{product_catalog}/active-direct-sale', [ProductCatalogController::class, 'setActiveForDirectSale']);
        Route::put('product-catalogs/{product_catalog}/active-self-order', [ProductCatalogController::class, 'setActiveForSelfOrder']);
        Route::put('product-catalogs/{product_catalog}/active-kiosk', [ProductCatalogController::class, 'setActiveForKiosk']);
        Route::apiResource('users', UserController::class)->except(['destroy']);
        Route::post('users/{user}/qr-code', [UserController::class, 'generateQrCode']);
        Route::get('users/{user}/qr', [UserController::class, 'qr']);
        Route::post('users/{user}/qr-code/email', [UserController::class, 'sendQrEmail']);
        Route::apiResource('rooms', RoomController::class)->except(['destroy', 'index', 'show']);
        Route::apiResource('rooms.tables', TableElementController::class)->shallow()->except(['destroy', 'index', 'show']);
        Route::apiResource('stations', StationController::class)->except(['destroy', 'index']);
        // ->parameters(...) : Laravel singularise "passes" en "pass" (anglais) par défaut, alors que
        // PasseController type-hint `Passe $passe` — sans ce forçage, le binding implicite de route
        // échoue silencieusement sur show/update/destroy (reçoit une instance vide au lieu du bon
        // enregistrement, "pass" et "passe" ne correspondant jamais). Repéré via le CRUD Paramètres :
        // un update renvoyait {"station":null} avec un 200, un destroy renvoyait 204 sans rien supprimer.
        Route::apiResource('passes', PasseController::class)->parameters(['passes' => 'passe'])->except(['destroy', 'index']);
        Route::apiResource('taxes', TaxController::class)->except(['destroy', 'index']);
        // Liste globale des types de place (Adulte/Étudiant/Senior...), réutilisable entre events
        // — le prix, lui, est propre à chaque event (voir events/{event}/ticket-prices, resté
        // superviseur+ ci-dessus avec le reste de la gestion des events).
        Route::apiResource('event-ticket-types', EventTicketTypeController::class)->except(['destroy']);
        // Liste globale d'ingrédients (ex. Oignon, Fromage), rattachés à des produits depuis leur
        // fiche (voir ProductController::syncableIngredients) — même pattern "active" que le reste.
        Route::apiResource('ingredients', IngredientController::class)->except(['destroy']);
        // Créer/modifier une imprimante est une action Paramètres — index déjà ouvert à tous
        // les rôles authentifiés ci-dessus (voir ActivePrinterService).
        Route::apiResource('printers', PrinterController::class)->except(['destroy', 'index']);
        // Gérer les codes de réduction eux-mêmes (créer/modifier) est une action Paramètres — les
        // UTILISER au paiement (discounts/validate ci-dessous) est une action superviseur+.
        Route::apiResource('discounts', DiscountController::class)->except(['destroy']);
        // Écriture sur le catalogue produit — lecture (index/show) ouverte plus haut, need par le POS.
        Route::post('products', [ProductController::class, 'store']);
        Route::put('products/{product}', [ProductController::class, 'update']);
        Route::delete('products/{product}', [ProductController::class, 'destroy']);
        Route::post('products/{product}/image', [ProductController::class, 'uploadImage']);
        Route::delete('products/{product}/image', [ProductController::class, 'removeImage']);
        // Réglages génériques clé/valeur (ex. open_at/close_at) — voir ParamController.
        Route::apiResource('params', ParamController::class);
    });

    // ---- Superviseur (et admin) — tout le reste sauf Paramètres ----
    Route::middleware('role:superviseur')->group(function () {
        Route::post('discounts/validate', [DiscountController::class, 'validateCode']);
        Route::put('clients/{client}', [ClientController::class, 'update']);
        Route::delete('clients/{client}', [ClientController::class, 'destroy']);
        Route::get('tickets', [TicketController::class, 'index']);
        Route::get('tickets/{ticket}', [TicketController::class, 'show']);
        Route::get('reports/summary', [ReportController::class, 'summary']);
        // Export comptable (voir Readme.md Todo) — période libre, contrairement à reports/summary
        // (jour/semaine/mois fixes uniquement) : le comptable a besoin d'un intervalle arbitraire
        // (ex. un trimestre TVA), pas d'un préréglage.
        Route::get('reports/export/csv', [AccountingExportController::class, 'csv']);
        Route::get('reports/export/pdf', [AccountingExportController::class, 'pdf']);
        Route::apiResource('events', EventController::class);
        Route::post('events/{event}/image', [EventController::class, 'uploadImage']);
        Route::delete('events/{event}/image', [EventController::class, 'removeImage']);
        Route::put('events/{event}/ticket-prices', [EventTicketPriceController::class, 'update']);
        Route::post('events/{event}/dates', [EventDateController::class, 'store']);
        Route::put('event-dates/{event_date}', [EventDateController::class, 'update']);
        Route::delete('event-dates/{event_date}', [EventDateController::class, 'destroy']);
        Route::post('event-tickets/validate', [EventTicketController::class, 'validateCode']);
        Route::post('event-tickets/{event_ticket}/assign-table', [EventTicketController::class, 'assignTable']);
        // "Voir les rapports/historiques" : la liste/le détail des sessions passées, pas
        // l'ouverture elle-même (voir ::active plus haut, ouverte à tous — le POS a besoin de
        // savoir si UNE caisse est ouverte pour vendre, sans pouvoir en ouvrir/fermer une).
        Route::get('cash-sessions', [CashSessionController::class, 'index']);
        Route::post('cash-sessions', [CashSessionController::class, 'store']);
        Route::get('cash-sessions/{cash_session}', [CashSessionController::class, 'show']);
        Route::post('cash-sessions/{cash_session}/close', [CashSessionController::class, 'close']);
        Route::post('orders/{order}/corrections', [OrderController::class, 'correction']);
    });

    // ---- POS (tous les rôles) ----
    Route::post('tickets', [TicketController::class, 'store']);
    Route::post('tickets/{ticket}/send-email', [TicketController::class, 'sendEmail']);
    Route::post('tickets/{ticket}/print-thermal', [TicketController::class, 'printThermal']);

    // Réservations : ouvert à tous les rôles (voir Readme.md, "ajouter Gestion des commandes et
    // Réservations pour les utilisateurs").
    Route::get('bookings', [BookingController::class, 'index']);
    Route::post('bookings', [BookingController::class, 'store']);
    Route::get('bookings/{booking}', [BookingController::class, 'show']);
    Route::put('bookings/{booking}', [BookingController::class, 'update']);
    Route::delete('bookings/{booking}', [BookingController::class, 'destroy']);
    Route::post('bookings/{booking}/validate', [BookingController::class, 'validateBooking']);
    Route::post('bookings/{booking}/mark-present', [BookingController::class, 'markPresent']);

    // Vente de place (voir Readme.md, "section vente de place où tous les rôles ont accès") :
    // juste vendre une place sur une occurrence déjà créée (EventDashboard) — créer/modifier
    // l'événement ou ses occurrences reste dans le groupe superviseur ci-dessus (voir
    // events/{event}/dates, event-dates/{event_date} PUT/DELETE), même logique que
    // bookings/orders déjà ouverts à tous.
    Route::get('event-dates', [EventDateController::class, 'index']);
    Route::get('event-dates/{event_date}', [EventDateController::class, 'show']);
    // Lecture des tarifs : nécessaire pour peupler le sélecteur de type de place au moment de la
    // vente (EventDashboard, ouvert à tous les rôles) — l'écriture reste superviseur+ ci-dessus.
    Route::get('events/{event}/ticket-prices', [EventTicketPriceController::class, 'index']);
    Route::get('event-tickets', [EventTicketController::class, 'index']);
    Route::post('event-tickets', [EventTicketController::class, 'store']);
    // Modale de paiement dédiée dans EventDashboard, pas POS Vente directe (voir docblock de
    // EventTicketController::pay) — même groupe "tous rôles" que store ci-dessus.
    Route::post('event-tickets/pay', [EventTicketController::class, 'pay']);
    Route::put('event-tickets/{event_ticket}', [EventTicketController::class, 'update']);
    Route::delete('event-tickets/{event_ticket}', [EventTicketController::class, 'destroy']);

    // POS Restaurant (voir Readme.md) : une table ouverte = une Order (state par défaut 'send').
    Route::get('orders', [OrderController::class, 'index']);
    Route::post('orders', [OrderController::class, 'store']);
    Route::get('orders/{order}', [OrderController::class, 'show']);
    Route::delete('orders/{order}', [OrderController::class, 'destroy']);
    Route::post('orders/{order}/pay', [OrderController::class, 'pay']);
    Route::post('orders/{order}/transfer', [OrderController::class, 'transfer']);
    Route::post('orders/{order}/sections', [OrderSectionController::class, 'store']);
    Route::delete('order-sections/{order_section}', [OrderSectionController::class, 'destroy']);
    Route::post('order-sections/{order_section}/valider', [OrderSectionController::class, 'valider']);
    Route::post('order-sections/{order_section}/demander', [OrderSectionController::class, 'demander']);
    Route::post('order-sections/{order_section}/marquer-fait', [OrderSectionController::class, 'marquerFait']);
    Route::post('order-sections/{order_section}/envoyer', [OrderSectionController::class, 'envoyer']);
    Route::post('order-sections/{order_section}/lines', [OrderLineController::class, 'store']);
    Route::put('order-lines/{order_line}', [OrderLineController::class, 'update']);
    Route::delete('order-lines/{order_line}', [OrderLineController::class, 'destroy']);
    Route::delete('order-lines/{order_line}/menu', [OrderLineController::class, 'destroyMenu']);

    // erp_self_order, mode kiosque (voir KioskOrderController) : encaisse immédiatement ET passe
    // en cuisine — ni orders/{order}/pay (bloque tant que non 'seed') ni tickets (jamais vu en
    // cuisine) ne suffisent seuls, voir docblock du contrôleur.
    Route::post('kiosk-orders', [KioskOrderController::class, 'store']);

    // Variant "QR code" du paiement kiosque (voir KioskCheckoutController) : crée une session
    // Stripe Checkout et fige la vente en attente — c'est StripeWebhookController (route publique
    // ci-dessus) qui matérialise Ticket+Order une fois le paiement confirmé, pas cette route.
    Route::post('kiosk-checkouts', [KioskCheckoutController::class, 'store']);
    Route::get('kiosk-checkouts/{kiosk_checkout}', [KioskCheckoutController::class, 'show']);
});
