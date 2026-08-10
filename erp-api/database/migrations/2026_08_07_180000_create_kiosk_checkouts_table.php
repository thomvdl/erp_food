<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Session de paiement Stripe (Bancontact QR) en attente de confirmation — le kiosque crée
     * cette ligne au moment où le client scanne, mais le Ticket/Order réels (voir
     * App\Support\KioskSaleRecorder) ne sont créés qu'une fois le webhook Stripe reçu (voir
     * App\Http\Controllers\Api\StripeWebhookController — normalement `checkout.session.completed`
     * pour Bancontact, qui confirme en direct, pas un event async_payment_* à proprement parler),
     * potentiellement plusieurs dizaines de secondes après la requête initiale, sur un appareil
     * différent (le téléphone du client). `lines`/`total`/`discount_amount` sont figés ici au
     * moment du scan (comme unit_price sur ticket_lines) : le webhook ne recalcule jamais, il
     * matérialise exactement ce qui a été montré au client sur le QR, même si le catalogue/la
     * réduction ont changé entretemps.
     */
    public function up(): void
    {
        Schema::create('kiosk_checkouts', function (Blueprint $table) {
            $table->id();
            $table->string('stripe_checkout_session_id')->unique();
            $table->string('status')->default('pending');
            $table->foreignId('cash_session_id')->constrained('cash_sessions');
            $table->foreignId('client_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->foreignId('discount_id')->nullable()->constrained('discounts')->nullOnDelete();
            $table->decimal('discount_amount', 8, 2)->nullable();
            // Même principe que discount_id/discount_amount : le variant QR paie de façon
            // asynchrone (webhook Stripe), les points doivent donc être résolus/figés au moment
            // du scan (KioskCheckoutController::store) — le webhook
            // (StripeWebhookController::markPaid) ne recalcule jamais.
            $table->integer('points_earned')->nullable();
            $table->integer('points_redeemed')->nullable();
            $table->decimal('points_redeemed_amount', 8, 2)->nullable();
            $table->json('lines');
            $table->decimal('total', 8, 2);
            // Pas de contrainte FK — même raison que orders.ticket_id (voir migration
            // add_ticket_id_to_orders_table) : simple repère, jamais de suppression en cascade.
            $table->unsignedBigInteger('ticket_id')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kiosk_checkouts');
    }
};
