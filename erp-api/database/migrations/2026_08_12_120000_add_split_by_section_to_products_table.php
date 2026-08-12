<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Réglage par menu (is_menu=true) : quand actif, chaque groupe de choix atterrit dans sa
     * propre OrderSection (une par label de groupe, ex. "Entrée"/"Plat") au lieu de la section
     * active côté staff — voir OrderLineController::addMenu. Sans effet sur un produit normal/
     * combo, et sans effet en dehors du POS Restaurant (seul flux où les sections servent à
     * échelonner le service).
     */
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->boolean('split_by_section')->default(false)->after('is_menu');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('split_by_section');
        });
    }
};
