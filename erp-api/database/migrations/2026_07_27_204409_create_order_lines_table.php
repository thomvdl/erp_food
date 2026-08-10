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
        Schema::create('order_lines', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('quantity')->default(1);
            $table->string('note')->nullable();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            // "Éclater en vraies lignes séparées à la commande" : un combo ajouté crée une
            // OrderLine par composant (product_id = le composant réel, pas le combo) plutôt
            // qu'une seule ligne opaque — combo_id garde la trace du combo d'origine
            // (nullOnDelete : supprimer la définition du combo ne doit pas casser des lignes déjà
            // commandées), sert à regrouper/incrémenter si on en recommande, voir syncCombo().
            $table->foreignId('combo_id')->nullable()->constrained('products')->nullOnDelete();
            // Une section peut mélanger des produits de plusieurs stations (ex. entrée froide +
            // plat chaud) — "marquer prête"/"envoyer" ne peut donc pas être une bascule au niveau
            // de la section : chaque LIGNE suit son propre statut (done/sent), la section ne
            // passe à l'état suivant que lorsque toutes ses lignes le sont (voir
            // OrderSectionController::marquerFait/envoyer).
            $table->boolean('done')->default(false);
            $table->boolean('sent')->default(false);
            // "Corriger une commande s'il y a un produit en trop" : une ligne de correction reste
            // un produit normal (même quantity POSITIVE, jamais négative en base) mais ce flag
            // inverse son effet sur le total (voir OrderController::pay). done/sent sont forcés à
            // true à la création : une correction ne repasse jamais par la cuisine.
            $table->boolean('is_correction')->default(false);
            $table->foreignId('order_section_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('order_lines');
    }
};
