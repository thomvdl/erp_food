<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Page affichée dans le navigateur du CLIENT (son propre téléphone) après un paiement Stripe
// Checkout kiosque (voir KioskCheckoutController::store, success_url/cancel_url) — la confirmation
// réelle passe par le webhook Stripe et le kiosque lui-même (voir StripeWebhookController,
// KioskCheckoutPaid), cette page ne sert qu'à dire au client de relever la tête vers l'écran du
// kiosque plutôt que d'attendre une réponse ici.
Route::get('kiosk-checkout/{status}', fn (string $status) => view('kiosk-checkout.result', ['status' => $status]))
    ->whereIn('status', ['success', 'cancel'])
    ->name('kiosk-checkout.result');
