<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Session de paiement Stripe (boutique en ligne erp_public_shop) en attente de confirmation
     * — même principe que kiosk_checkouts (voir create_kiosk_checkouts_table) : le site crée
     * cette ligne au moment où le client valide son panier, mais le Ticket/Order réels (voir
     * App\Support\ShopSaleRecorder) ne sont créés qu'une fois le webhook Stripe reçu (voir
     * App\Http\Controllers\Api\StripeWebhookController). `lines`/`total`/`delivery_fee`/
     * `discount_id`/`discount_amount`/`client_id`/`points_*` sont tous figés ici au moment de la
     * commande (avant paiement, voir ShopCheckoutController::store), jamais recalculés par le
     * webhook — pas de cash_session_id en revanche, contrairement à kiosk_checkouts : aucun
     * caissier physique sur la boutique en ligne. `client_id` résolu par téléphone/email au moment
     * de la commande (jamais un id brut envoyé par le front, voir ShopCustomerController).
     */
    public function up(): void
    {
        Schema::create('shop_checkouts', function (Blueprint $table) {
            $table->id();
            // Nullable : la ligne existe brièvement avant la session Stripe elle-même (voir
            // ShopCheckoutController::store — contrairement au kiosque, la boutique a besoin de
            // connaître son propre id AVANT de construire success_url/cancel_url, pour que la
            // page de confirmation puisse interroger GET shop/checkouts/{id} au retour).
            $table->string('stripe_checkout_session_id')->nullable()->unique();
            $table->string('status')->default('pending');
            $table->string('fulfillment_type');
            $table->json('lines');
            $table->decimal('total', 8, 2);
            $table->decimal('delivery_fee', 8, 2)->nullable();
            $table->string('customer_name')->nullable();
            $table->string('customer_email')->nullable();
            $table->string('customer_phone')->nullable();
            $table->text('delivery_address')->nullable();
            // Code de réduction (voir App\Support\DiscountCalculator) — n'importe quel client
            // anonyme peut en saisir un, pas de garde de rôle (route publique).
            $table->foreignId('discount_id')->nullable()->constrained('discounts')->nullOnDelete();
            $table->decimal('discount_amount', 8, 2)->nullable();
            // Compte client optionnel (voir ShopCustomerController) — points_earned/redeemed/
            // redeemed_amount figés à la création comme le reste, jamais recalculés par le webhook.
            $table->foreignId('client_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->integer('points_earned')->nullable();
            $table->integer('points_redeemed')->nullable();
            $table->decimal('points_redeemed_amount', 8, 2)->nullable();
            // Pas de contrainte FK — même raison que kiosk_checkouts.ticket_id/orders.ticket_id :
            // simple repère, jamais de suppression en cascade.
            $table->unsignedBigInteger('ticket_id')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_checkouts');
    }
};
