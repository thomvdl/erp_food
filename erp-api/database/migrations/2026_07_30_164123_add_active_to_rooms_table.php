<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "Ne plus avoir la possibilité de supprimer... mais ajouter un champ active (default true)"
     * (voir Readme.md) : la suppression pure de rooms/tables/catégories/catalogues/
     * utilisateurs/rôles/stations/taxes est retirée (cascade delete jugée trop risquée sur ces
     * entités référencées un peu partout) au profit d'une désactivation — la ligne reste en
     * base, seuls les composants qui la consomment cessent de la proposer. Colonne ajoutée à
     * l'identique sur les 8 tables concernées (voir les migrations `add_active_to_*` voisines).
     */
    public function up(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->boolean('active')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->dropColumn('active');
        });
    }
};
