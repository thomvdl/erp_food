<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Voir add_active_to_rooms_table pour la justification. Distinct de active_restaurant/
     * active_direct_sale (voir create_product_catalogs_table) : ceux-là choisissent lequel des
     * catalogues actifs est actuellement affiché par contexte POS, `active` ici détermine
     * simplement si le catalogue existe encore/est utilisable du tout.
     */
    public function up(): void
    {
        Schema::table('product_catalogs', function (Blueprint $table) {
            $table->boolean('active')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('product_catalogs', function (Blueprint $table) {
            $table->dropColumn('active');
        });
    }
};
