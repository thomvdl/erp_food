<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Optionnel : sert de préfixe au label auto-généré des tables de la salle (ex. "BAR" ->
     * BAR-1, BAR-2 — voir FloorPlanEditor::nextTableLabel côté erp-app). Si vide, l'éditeur
     * retombe sur le préfixe par défaut "T".
     */
    public function up(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->string('prefix')->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->dropColumn('prefix');
        });
    }
};
