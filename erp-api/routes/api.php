<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\CashSessionController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\EventController;
use App\Http\Controllers\Api\EventDateController;
use App\Http\Controllers\Api\EventTicketController;
use App\Http\Controllers\Api\PaymentMethodController;
use App\Http\Controllers\Api\ProductCatalogController;
use App\Http\Controllers\Api\ProductCategoryController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\RoomController;
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

Route::middleware('auth:sanctum')->group(function () {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('auth/me', [AuthController::class, 'me']);

    Route::apiResource('product-categories', ProductCategoryController::class);
    Route::apiResource('product-catalogs', ProductCatalogController::class);
    Route::post('product-catalogs/{product_catalog}/activate-restaurant', [ProductCatalogController::class, 'activateForRestaurant']);
    Route::post('product-catalogs/{product_catalog}/activate-direct-sale', [ProductCatalogController::class, 'activateForDirectSale']);
    Route::apiResource('roles', RoleController::class);
    Route::apiResource('users', UserController::class);
    Route::post('users/{user}/qr-code', [UserController::class, 'generateQrCode']);
    Route::get('users/{user}/qr', [UserController::class, 'qr']);
    Route::post('users/{user}/qr-code/email', [UserController::class, 'sendQrEmail']);
    Route::apiResource('rooms', RoomController::class);
    Route::apiResource('rooms.tables', TableElementController::class)->shallow();
    Route::apiResource('stations', StationController::class);
    Route::apiResource('taxes', TaxController::class);
    Route::apiResource('products', ProductController::class);
    Route::get('clients', [ClientController::class, 'index']);
    Route::post('clients', [ClientController::class, 'store']);
    Route::get('payment-methods', [PaymentMethodController::class, 'index']);
    Route::get('tickets', [TicketController::class, 'index']);
    Route::post('tickets', [TicketController::class, 'store']);
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
});
