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
        Schema::create('rooms', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            // 'restaurant' par défaut : les salles existantes ont été créées pour le plan de
            // salle du POS Restaurant avant que ce champ n'existe.
            $table->string('type')->default('restaurant');
            // Taille (mêmes unités que tables.pos_left/width...) de la zone dessinable d'une
            // salle — sert à mettre le plan à l'échelle sans barre de défilement dans les écrans
            // qui l'affichent en lecture seule (transfert de table, dashboard événement).
            $table->unsignedInteger('width')->default(1000);
            $table->unsignedInteger('height')->default(700);
            $table->timestamps();
            // "Ne plus avoir la possibilité de supprimer... mais ajouter un champ active" (voir
            // Readme.md) : suppression jugée trop risquée sur les entités référencées un peu
            // partout (rooms/tables/catégories/catalogues/utilisateurs/rôles/stations/taxes) —
            // désactivation à la place, la ligne reste en base.
            $table->boolean('active')->default(true);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('rooms');
    }
};
