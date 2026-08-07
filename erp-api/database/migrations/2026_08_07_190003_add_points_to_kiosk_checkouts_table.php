<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Même principe que discount_id/discount_amount sur kiosk_checkouts (voir migration
     * create_kiosk_checkouts_table) : le variant QR paie de façon asynchrone (webhook Stripe), les
     * points à utiliser doivent donc être résolus/figés au moment du scan
     * (KioskCheckoutController::store), le webhook (StripeWebhookController::markPaid) ne
     * recalcule jamais, il matérialise exactement ce qui a été figé ici.
     */
    public function up(): void
    {
        Schema::table('kiosk_checkouts', function (Blueprint $table) {
            $table->integer('points_earned')->nullable()->after('discount_amount');
            $table->integer('points_redeemed')->nullable()->after('points_earned');
            $table->decimal('points_redeemed_amount', 8, 2)->nullable()->after('points_redeemed');
        });
    }

    public function down(): void
    {
        Schema::table('kiosk_checkouts', function (Blueprint $table) {
            $table->dropColumn(['points_earned', 'points_redeemed', 'points_redeemed_amount']);
        });
    }
};
