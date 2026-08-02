<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Taille (en "unités de plan", même échelle que tables.pos_left/width...) de la zone
     * dessinable d'une salle — utilisée pour mettre le plan à l'échelle sans barre de défilement
     * dans les écrans qui l'affichent en lecture seule (POS - Restaurant, transfert de table,
     * dashboard/check-in événement). Défaut généreux pour les salles déjà existantes, dont les
     * tables ont été positionnées sans borne connue jusqu'ici.
     */
    public function up(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->unsignedInteger('width')->default(1000)->after('type');
            $table->unsignedInteger('height')->default(700)->after('width');
        });
    }

    public function down(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->dropColumn(['width', 'height']);
        });
    }
};
