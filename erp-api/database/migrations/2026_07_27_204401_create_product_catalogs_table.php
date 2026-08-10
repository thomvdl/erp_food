<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('product_catalogs', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            // Deux sélections indépendantes plutôt qu'un seul `active` générique : le POS
            // Restaurant et le POS Vente directe peuvent chacun afficher plusieurs catalogues
            // actifs en même temps (voir ProductCatalogController@setActiveForRestaurant/
            // setActiveForDirectSale) — booléens indépendants par catalogue, pas une sélection
            // exclusive. false par défaut, même raison que l'ancien `active` : un nouveau
            // catalogue ne doit jamais naître déjà actif quelque part.
            $table->boolean('active_restaurant')->default(false);
            $table->boolean('active_direct_sale')->default(false);
            $table->timestamps();
            // Distinct de active_restaurant/active_direct_sale ci-dessus : ceux-là choisissent
            // lequel des catalogues actifs est actuellement affiché par contexte POS, `active`
            // ici détermine simplement si le catalogue existe encore/est utilisable du tout.
            $table->boolean('active')->default(true);
            // active_self_order (QR, erp_self_order) et active_kiosk (erp_kiosk) sont
            // indépendants l'un de l'autre et des deux précédents : chaque canal de vente peut
            // afficher un catalogue différent en même temps.
            $table->boolean('active_self_order')->default(false);
            $table->boolean('active_kiosk')->default(false);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('product_catalogs');
    }
};
