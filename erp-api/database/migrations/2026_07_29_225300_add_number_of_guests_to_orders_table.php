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
        Schema::table('orders', function (Blueprint $table) {
            // "Ouvrir une table avec le nombre de personnes" (voir Readme.md) — appartient à la
            // commande (une visite précise), pas à la table elle-même (`tables` n'a pas de notion
            // de capacité physique dans ce schéma).
            $table->unsignedInteger('number_of_guests')->nullable()->after('table_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('number_of_guests');
        });
    }
};
