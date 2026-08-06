<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Un combo est un Product comme un autre (même prix/taxe/catalogues/panier/ticket) —
     * `is_combo` sert uniquement à savoir qu'il faut charger/afficher sa composition (voir
     * product_components), notamment pour l'éclater en plats individuels au Kitchen Display.
     */
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->boolean('is_combo')->default(false)->after('active');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('is_combo');
        });
    }
};
