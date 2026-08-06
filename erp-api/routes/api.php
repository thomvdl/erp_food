<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\CashSessionController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\EventController;
use App\Http\Controllers\Api\EventDateController;
use App\Http\Controllers\Api\EventTicketController;
use App\Http\Controllers\Api\KioskOrderController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\OrderLineController;
use App\Http\Controllers\Api\OrderSectionController;
use App\Http\Controllers\Api\PasseController;
use App\Http\Controllers\Api\PaymentMethodController;
use App\Http\Controllers\Api\ProductCatalogController;
use App\Http\Controllers\Api\ProductCategoryController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\RoomController;
use App\Http\Controllers\Api\SelfOrderController;
use App\Http\Controllers\Api\StationController;
use App\Http\Controllers\Api\TableElementController;
use App\Http\Controllers\Api\TaxController;
use App\Http\Controllers\Api\TicketController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

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

Route::middleware('auth:sanctum')->group(function () {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('auth/me', [AuthController::class, 'me']);
    Route::get('company', [CompanyController::class, 'show']);

    // ->except(['destroy']) sur product-categories/product-catalogs/roles/users/rooms/
    // rooms.tables/stations/taxes : "ne plus avoir la possibilité de supprimer... ajouter un
    // champ active" (voir Readme.md) — le cascade delete sur ces entités très référencées était
    // jugé trop risqué, remplacé par une désactivation (update ordinaire avec active=false).
    // Passes et products non concernés, hors du périmètre de cette demande.
    Route::apiResource('product-categories', ProductCategoryController::class)->except(['destroy']);
    Route::apiResource('product-catalogs', ProductCatalogController::class)->except(['destroy']);
    Route::post('product-catalogs/{product_catalog}/activate-restaurant', [ProductCatalogController::class, 'activateForRestaurant']);
    Route::post('product-catalogs/{product_catalog}/activate-direct-sale', [ProductCatalogController::class, 'activateForDirectSale']);
    Route::post('product-catalogs/{product_catalog}/activate-self-order', [ProductCatalogController::class, 'activateForSelfOrder']);
    Route::post('product-catalogs/{product_catalog}/activate-kiosk', [ProductCatalogController::class, 'activateForKiosk']);
    Route::apiResource('roles', RoleController::class)->except(['destroy']);
    Route::apiResource('users', UserController::class)->except(['destroy']);
    Route::post('users/{user}/qr-code', [UserController::class, 'generateQrCode']);
    Route::get('users/{user}/qr', [UserController::class, 'qr']);
    Route::post('users/{user}/qr-code/email', [UserController::class, 'sendQrEmail']);
    Route::apiResource('rooms', RoomController::class)->except(['destroy']);
    Route::apiResource('rooms.tables', TableElementController::class)->shallow()->except(['destroy']);
    Route::apiResource('stations', StationController::class)->except(['destroy']);
    // ->parameters(...) : Laravel singularise "passes" en "pass" (anglais) par défaut, alors que
    // PasseController type-hint `Passe $passe` — sans ce forçage, le binding implicite de route
    // échoue silencieusement sur show/update/destroy (reçoit une instance vide au lieu du bon
    // enregistrement, "pass" et "passe" ne correspondant jamais). Repéré via le CRUD Paramètres :
    // un update renvoyait {"station":null} avec un 200, un destroy renvoyait 204 sans rien supprimer.
    Route::apiResource('passes', PasseController::class)->parameters(['passes' => 'passe'])->except(['destroy']);
    Route::apiResource('taxes', TaxController::class)->except(['destroy']);
    Route::apiResource('products', ProductController::class);
    Route::apiResource('clients', ClientController::class);
    Route::get('payment-methods', [PaymentMethodController::class, 'index']);
    Route::get('tickets', [TicketController::class, 'index']);
    Route::post('tickets', [TicketController::class, 'store']);
    Route::get('tickets/{ticket}', [TicketController::class, 'show']);
    Route::post('tickets/{ticket}/send-email', [TicketController::class, 'sendEmail']);
    Route::post('tickets/{ticket}/print-thermal', [TicketController::class, 'printThermal']);
    Route::apiResource('events', EventController::class);
    Route::get('event-dates', [EventDateController::class, 'index']);
    Route::post('events/{event}/dates', [EventDateController::class, 'store']);
    Route::get('event-dates/{event_date}', [EventDateController::class, 'show']);
    Route::put('event-dates/{event_date}', [EventDateController::class, 'update']);
    Route::delete('event-dates/{event_date}', [EventDateController::class, 'destroy']);
    Route::get('event-tickets', [EventTicketController::class, 'index']);
    Route::post('event-tickets', [EventTicketController::class, 'store']);
    Route::post('event-tickets/validate', [EventTicketController::class, 'validateCode']);
    Route::post('event-tickets/{event_ticket}/assign-table', [EventTicketController::class, 'assignTable']);
    Route::put('event-tickets/{event_ticket}', [EventTicketController::class, 'update']);
    Route::delete('event-tickets/{event_ticket}', [EventTicketController::class, 'destroy']);
    Route::get('bookings', [BookingController::class, 'index']);
    Route::post('bookings', [BookingController::class, 'store']);
    Route::get('bookings/{booking}', [BookingController::class, 'show']);
    Route::put('bookings/{booking}', [BookingController::class, 'update']);
    Route::delete('bookings/{booking}', [BookingController::class, 'destroy']);
    Route::post('bookings/{booking}/validate', [BookingController::class, 'validateBooking']);
    Route::get('cash-sessions', [CashSessionController::class, 'index']);
    Route::get('cash-sessions/active', [CashSessionController::class, 'active']);
    Route::post('cash-sessions', [CashSessionController::class, 'store']);
    Route::get('cash-sessions/{cash_session}', [CashSessionController::class, 'show']);
    Route::post('cash-sessions/{cash_session}/close', [CashSessionController::class, 'close']);

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

    // erp_self_order, mode kiosque (voir KioskOrderController) : encaisse immédiatement ET passe
    // en cuisine — ni orders/{order}/pay (bloque tant que non 'seed') ni tickets (jamais vu en
    // cuisine) ne suffisent seuls, voir docblock du contrôleur.
    Route::post('kiosk-orders', [KioskOrderController::class, 'store']);
});
