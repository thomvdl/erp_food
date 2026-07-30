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
        Schema::table('order_sections', function (Blueprint $table) {
            // Cycle kitchen display (Readme.md) : en_attente (par défaut, section en cours de
            // composition en salle) -> demande (validée + envoyée en cuisine depuis POS -
            // Restaurant) -> fait (un poste de cuisine l'a marquée prête). Distinct de
            // orders.state (send/ask/do/seed/done) qui reste le cycle global de la commande.
            $table->string('state')->default('en_attente')->after('order_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('order_sections', function (Blueprint $table) {
            $table->dropColumn('state');
        });
    }
};
