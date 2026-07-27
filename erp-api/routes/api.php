<?php

use App\Http\Controllers\Api\ProductCatalogController;
use App\Http\Controllers\Api\ProductCategoryController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\RoomController;
use App\Http\Controllers\Api\StationController;
use App\Http\Controllers\Api\TableElementController;
use App\Http\Controllers\Api\TaxController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

// Pas encore d'auth (Sanctum) — toutes les routes sont ouvertes pour l'instant, cohérent avec
// l'état actuel du projet (voir CONTEXT.md). À verrouiller derrière auth:sanctum (+ un split
// lecture/écriture par rôle comme ERP/erp-api/routes/api.php) avant tout déploiement au-delà
// de localhost.

Route::apiResource('product-categories', ProductCategoryController::class);
Route::apiResource('product-catalogs', ProductCatalogController::class);
Route::post('product-catalogs/{product_catalog}/activate-restaurant', [ProductCatalogController::class, 'activateForRestaurant']);
Route::post('product-catalogs/{product_catalog}/activate-direct-sale', [ProductCatalogController::class, 'activateForDirectSale']);
Route::apiResource('roles', RoleController::class);
Route::apiResource('users', UserController::class);
Route::apiResource('rooms', RoomController::class);
Route::apiResource('rooms.tables', TableElementController::class)->shallow();
Route::apiResource('stations', StationController::class);
Route::apiResource('taxes', TaxController::class);
Route::apiResource('products', ProductController::class);
