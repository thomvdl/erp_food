<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Compte client optionnel de la boutique en ligne (connexion par numéro de téléphone, voir
     * ShopCustomerController) — mêmes colonnes que kiosk_checkouts pour le même usage
     * (App\Support\LoyaltyPoints) : `client_id` résolu par téléphone au moment de la commande
     * (jamais un id brut envoyé par le front), `points_earned`/`points_redeemed`/
     * `points_redeemed_amount` figés à la création comme le reste (lines/total/discount_amount),
     * jamais recalculés par le webhook Stripe.
     */
    public function up(): void
    {
        Schema::table('shop_checkouts', function (Blueprint $table) {
            $table->foreignId('client_id')->nullable()->after('customer_phone')->constrained('clients')->nullOnDelete();
            $table->integer('points_earned')->nullable();
            $table->integer('points_redeemed')->nullable();
            $table->decimal('points_redeemed_amount', 8, 2)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('shop_checkouts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('client_id');
            $table->dropColumn(['points_earned', 'points_redeemed', 'points_redeemed_amount']);
        });
    }
};
