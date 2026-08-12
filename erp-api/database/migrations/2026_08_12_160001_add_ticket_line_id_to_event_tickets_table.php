<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Trace quelle ligne de ticket POS Vente directe a payé cette place (voir
     * TicketController::store, lien fait après paiement) — null tant que la place n'a pas encore
     * été encaissée là-bas. nullOnDelete plutôt que cascade : une place vendue ne doit jamais
     * disparaître parce que son ticket d'origine a été retiré (n'arrive pas aujourd'hui, aucune
     * suppression de Ticket n'existe, mais reste la sémantique la plus sûre).
     */
    public function up(): void
    {
        Schema::table('event_tickets', function (Blueprint $table) {
            $table->foreignId('ticket_line_id')->nullable()->after('price')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('event_tickets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('ticket_line_id');
        });
    }
};
