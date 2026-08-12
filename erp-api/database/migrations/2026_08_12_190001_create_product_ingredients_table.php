<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Quels ingrédients compose un produit, et lesquels le client peut retirer (`removable`,
     * ex. le pain d'un burger reste coché mais non décochable) — voir ProductController et la
     * modale de personnalisation panier (pos-vente.ts/order-builder.ts). Le retrait choisi au
     * panier n'est PAS stocké ici (pas de ligne par vente) : il se résume en texte libre dans
     * order_lines.note/ticket_lines.note ("Sans oignon"), déjà affiché partout (kitchen display,
     * reçus) sans aucune modification de schéma supplémentaire — voir MenuResolver::expandLines,
     * qui passe déjà `note` telle quelle pour un produit normal.
     */
    public function up(): void
    {
        Schema::create('product_ingredients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained()->cascadeOnDelete();
            $table->boolean('removable')->default(true);
            $table->timestamps();
            $table->unique(['product_id', 'ingredient_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_ingredients');
    }
};
