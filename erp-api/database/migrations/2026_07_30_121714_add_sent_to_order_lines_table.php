<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Pour les passes aussi, quand je valide dans un passe ça valide dans les deux pour la même
 * table et la même section" (voir Readme.md) — même bug que order_lines.done (migration
 * précédente), pour "Envoyer" cette fois : une section peut avoir des lignes réparties sur DEUX
 * passes différents (via des stations différentes, voir stations.passe_id) — "Envoyer" depuis un
 * passe ne doit marquer expédiées que SES lignes, pas toute la section (donc pas les lignes de
 * l'autre passe). Même principe que "done" : suivi par ligne, la section ne passe à 'seed' que
 * lorsque TOUTES ses lignes sont envoyées.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_lines', function (Blueprint $table) {
            $table->boolean('sent')->default(false)->after('done');
        });
    }

    public function down(): void
    {
        Schema::table('order_lines', function (Blueprint $table) {
            $table->dropColumn('sent');
        });
    }
};
