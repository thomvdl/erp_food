<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Repère libre saisi par le client au clavier numérique du kiosque (voir kiosk-order.ts,
     * réglage Paramètres > Réglages "kiosk_table_available") quand il choisit "sur place" —
     * volontairement PAS une foreignId vers `tables` (TableElement, plan de salle du POS
     * Restaurant/QR à table) : un kiosque fast-food n'a pas de plan de salle, juste des numéros
     * de plateau/tente de table. Sur `kiosk_checkouts` en plus d'`orders`/`tickets` : le variant
     * "QR code" fige tout ce dont StripeWebhookController a besoin AVANT paiement (voir
     * KioskCheckoutController::store), donc avant que orders/tickets existent.
     */
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('table_number', 20)->nullable()->after('table_id');
        });

        Schema::table('tickets', function (Blueprint $table) {
            $table->string('table_number', 20)->nullable()->after('table_id');
        });

        Schema::table('kiosk_checkouts', function (Blueprint $table) {
            $table->string('table_number', 20)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('table_number');
        });

        Schema::table('tickets', function (Blueprint $table) {
            $table->dropColumn('table_number');
        });

        Schema::table('kiosk_checkouts', function (Blueprint $table) {
            $table->dropColumn('table_number');
        });
    }
};
