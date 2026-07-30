<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Laravel redirige par défaut les invités non authentifiés vers une route nommée
        // 'login' (voir ApplicationBuilder::withMiddleware) — cette API est 100% JSON, il n'y a
        // pas de route 'login' web (routes/web.php n'a qu'une page d'accueil par défaut).
        // Sans ce override, une requête non authentifiée sans en-tête "Accept: application/json"
        // explicite (ex. un simple curl) plante en 500 (RouteNotFoundException) au lieu du 401
        // attendu — AuthController::login (public) répond en JSON de toute façon.
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );
    })->create();
