<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Retour utilisateur (voir Readme.md) : "c'est dans station qu'on doit pouvoir choisir dans
 * quelle passe ça doit aller" — inverse la relation Passe/Station. Le choix initial
 * (`passes.station_id`, un passe = une seule station, voir migration create_passes_table et
 * CONTEXT.md) est abandonné au profit du schéma de `ERP/` (le projet original) :
 * `stations.passe_id`, PLUSIEURS stations peuvent partager un même passe — modélise mieux la
 * réalité d'une cuisine (un même point d'expédition dessert souvent plusieurs postes).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->foreignId('passe_id')->nullable()->after('slug')->constrained()->nullOnDelete();
        });

        // Reporte les liaisons existantes (passes.station_id) sur stations.passe_id avant de
        // supprimer l'ancienne colonne — préserve les données déjà seedées (Viande -> Passe
        // Cuisine, Bar -> Passe Bar).
        DB::table('passes')->whereNotNull('station_id')->orderBy('id')->each(function ($passe) {
            DB::table('stations')->where('id', $passe->station_id)->update(['passe_id' => $passe->id]);
        });

        Schema::table('passes', function (Blueprint $table) {
            $table->dropForeign(['station_id']);
            $table->dropColumn('station_id');
        });
    }

    public function down(): void
    {
        Schema::table('passes', function (Blueprint $table) {
            $table->foreignId('station_id')->nullable()->constrained()->cascadeOnDelete();
        });

        DB::table('stations')->whereNotNull('passe_id')->orderBy('id')->each(function ($station) {
            DB::table('passes')->where('id', $station->passe_id)->update(['station_id' => $station->id]);
        });

        Schema::table('stations', function (Blueprint $table) {
            $table->dropForeign(['passe_id']);
            $table->dropColumn('passe_id');
        });
    }
};
