<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Un groupe de choix d'un menu (ex. "Entrée", "Accompagnement") : le client doit y choisir
     * entre `min_choices` et `max_choices` produits parmi `menuGroupOptions` (voir migration
     * jumelle). `product_id` = le produit "menu" propriétaire (is_menu=true) — cascadeOnDelete
     * puisque supprimer un menu doit supprimer ses groupes (contrairement à `component_ids` sur
     * `product_components`, ici il y a une vraie entité intermédiaire avec ses propres champs,
     * pas juste un pivot).
     */
    public function up(): void
    {
        Schema::create('menu_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->string('label');
            $table->unsignedInteger('min_choices')->default(1);
            $table->unsignedInteger('max_choices')->default(1);
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('menu_groups');
    }
};
