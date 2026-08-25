<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('product_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            // Ordre d'affichage manuel (voir ProductCategoryController::index, orderBy 'position'
            // au lieu de 'name').
            $table->unsignedInteger('position')->default(0);
            $table->string('slug')->unique();
            $table->timestamps();
            $table->boolean('active')->default(true);
            $table->string('icon', 8)->nullable();
            $table->string('image_path')->nullable();
        });

        // Catégorie "système" dédiée aux produits fantômes des billets d'événement (voir
        // create_products_table, produit 'billet-evenement' rattaché par slug) — isolée de la
        // vraie carte, jamais listée dans l'UI produits normale (voir
        // EventTicketPriceController::ticketCategory).
        DB::table('product_categories')->insert([
            'name' => 'Billets événements',
            'slug' => 'billets-evenements',
            'position' => 0,
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('product_categories');
    }
};
