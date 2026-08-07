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
