<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Même principe que active_self_order/active_kiosk (voir create_product_catalogs_table) :
     * canal de vente indépendant, un catalogue peut être actif pour la boutique en ligne
     * (erp_public_shop) sans l'être pour les autres. false par défaut, même raison que les
     * autres active_* : un nouveau catalogue ne doit jamais naître déjà actif quelque part.
     */
    public function up(): void
    {
        Schema::table('product_catalogs', function (Blueprint $table) {
            $table->boolean('active_public_shop')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('product_catalogs', function (Blueprint $table) {
            $table->dropColumn('active_public_shop');
        });
    }
};
