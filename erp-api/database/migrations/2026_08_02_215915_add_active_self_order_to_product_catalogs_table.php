<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Même principe que active_restaurant/active_direct_sale (voir create_product_catalogs_table)
     * : un catalogue actif à la fois pour ce contexte, indépendant des deux autres — erp_self_order
     * (QR et kiosque) peut afficher un catalogue différent du POS Restaurant ou Vente directe en
     * même temps.
     */
    public function up(): void
    {
        Schema::table('product_catalogs', function (Blueprint $table) {
            $table->boolean('active_self_order')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('product_catalogs', function (Blueprint $table) {
            $table->dropColumn('active_self_order');
        });
    }
};
