<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Boutique en ligne (erp_public_shop, voir App\Support\ShopSaleRecorder) : "à emporter" ou
     * "livraison", et l'adresse dans ce dernier cas — dénormalisé directement sur l'Order (même
     * logique que table_number, voir add_table_number_to_kiosk_tables) pour que le back-office/
     * kitchen display affichent l'info sans jointure vers shop_checkouts. Nullable : sans objet
     * pour les autres sources (pos_restaurant, self_order, kiosk...).
     */
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('fulfillment_type')->nullable()->after('source');
            $table->text('delivery_address')->nullable()->after('fulfillment_type');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['fulfillment_type', 'delivery_address']);
        });
    }
};
