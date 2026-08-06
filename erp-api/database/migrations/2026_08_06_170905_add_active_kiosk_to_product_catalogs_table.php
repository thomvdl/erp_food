<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Même principe que active_self_order (voir add_active_self_order_to_product_catalogs_table)
     * mais indépendant : erp_kiosk peut désormais afficher un catalogue différent de celui du QR
     * (erp_self_order), là où les deux partageaient auparavant active_self_order.
     */
    public function up(): void
    {
        Schema::table('product_catalogs', function (Blueprint $table) {
            $table->boolean('active_kiosk')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('product_catalogs', function (Blueprint $table) {
            $table->dropColumn('active_kiosk');
        });
    }
};
