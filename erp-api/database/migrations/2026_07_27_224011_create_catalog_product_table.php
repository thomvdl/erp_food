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
        // Pivot explicite (nom hors convention Laravel, précisé dans les deux belongsToMany) :
        // un produit peut appartenir à plusieurs catalogues, un catalogue à plusieurs produits.
        Schema::create('catalog_product', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_catalog_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['product_catalog_id', 'product_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('catalog_product');
    }
};
