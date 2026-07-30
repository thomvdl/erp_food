<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Quand il y a une table avec plusieurs produits, uniquement les produits de son propre poste
 * et de son propre passe [doivent être marqués] ; là quand on marque comme fait, ça le fait pour
 * tous les produits de la section" (voir Readme.md) — une section peut mélanger des produits de
 * plusieurs stations (ex. une entrée froide + un plat chaud dans la même section), donc "marquer
 * prête" ne peut plus être une bascule tout-ou-rien au niveau de la section : chaque LIGNE suit
 * désormais son propre statut, la section ne passe à 'do' que lorsque toutes ses lignes sont
 * faites (voir OrderSectionController::marquerFait).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_lines', function (Blueprint $table) {
            $table->boolean('done')->default(false)->after('product_id');
        });
    }

    public function down(): void
    {
        Schema::table('order_lines', function (Blueprint $table) {
            $table->dropColumn('done');
        });
    }
};
