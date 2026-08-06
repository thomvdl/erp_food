<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Composition d'un combo : quels produits (et en quelle quantité) le composent. Self-join sur
     * `products` — `combo_id` est le produit "combo" (is_combo=true, voir migration jumelle),
     * `component_product_id` un produit normal qui le compose. cascadeOnDelete sur `combo_id`
     * (supprimer le combo supprime sa composition) mais restrictOnDelete sur
     * `component_product_id` (même garde-fou que order_lines/ticket_lines.product_id : un
     * produit utilisé comme composant ne doit pas pouvoir disparaître silencieusement).
     */
    public function up(): void
    {
        Schema::create('product_components', function (Blueprint $table) {
            $table->id();
            $table->foreignId('combo_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('component_product_id')->constrained('products')->restrictOnDelete();
            $table->unsignedInteger('quantity')->default(1);
            $table->timestamps();
            $table->unique(['combo_id', 'component_product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_components');
    }
};
