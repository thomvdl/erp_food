<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Boutique en ligne (erp_public_shop, voir App\Support\ShopSaleRecorder) : nom/téléphone du
     * client collectés par Stripe Checkout (customer_details, voir shipping_details/
     * ShopCheckoutController::store) — dénormalisés ici comme delivery_address (voir
     * add_fulfillment_type_and_delivery_address_to_orders_table) pour que Gestion > Livraison
     * (erp-app) puisse contacter le client sans jointure vers shop_checkouts. Nullable : sans
     * objet pour les autres sources.
     */
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('customer_name')->nullable()->after('delivery_address');
            $table->string('customer_phone')->nullable()->after('customer_name');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['customer_name', 'customer_phone']);
        });
    }
};
