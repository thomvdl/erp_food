<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Produits éligibles dans un groupe de choix. cascadeOnDelete sur `menu_group_id` (supprimer
     * le groupe supprime ses options) mais restrictOnDelete sur `product_id` — même garde-fou que
     * `product_components.component_product_id` : un produit utilisé comme option ne doit pas
     * pouvoir disparaître silencieusement.
     */
    public function up(): void
    {
        Schema::create('menu_group_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('menu_group_id')->constrained('menu_groups')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->timestamps();
            $table->unique(['menu_group_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('menu_group_options');
    }
};
