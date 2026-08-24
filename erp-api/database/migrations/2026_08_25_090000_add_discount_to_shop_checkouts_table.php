<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Code de réduction boutique en ligne (voir ShopCheckoutController::store,
     * App\Support\DiscountCalculator) — même principe que kiosk_checkouts.discount_id/
     * discount_amount : résolu et figé au moment de la commande (avant paiement), jamais
     * recalculé par le webhook Stripe (voir StripeWebhookController). Contrairement au kiosque
     * (réservé aux superviseurs, voir KioskCheckoutController::store), n'importe quel client
     * anonyme peut saisir un code ici — pas de garde de rôle, il n'y a pas d'utilisateur connecté
     * sur cette route publique.
     */
    public function up(): void
    {
        Schema::table('shop_checkouts', function (Blueprint $table) {
            $table->foreignId('discount_id')->nullable()->after('delivery_address')->constrained('discounts')->nullOnDelete();
            $table->decimal('discount_amount', 8, 2)->nullable()->after('discount_id');
        });
    }

    public function down(): void
    {
        Schema::table('shop_checkouts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('discount_id');
            $table->dropColumn('discount_amount');
        });
    }
};
