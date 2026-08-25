<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Positionnée après create_event_ticket_types_table/create_event_ticket_prices_table (FK
     * event_ticket_type_id) — contrairement aux autres tables, l'ordre chronologique d'origine ne
     * suffisait pas ici : event_tickets a été créée avant event_ticket_types puis reliée par une
     * migration ALTER ultérieure, cette version consolidée doit donc être postérieure aux deux.
     */
    public function up(): void
    {
        Schema::create('event_tickets', function (Blueprint $table) {
            $table->id();
            // Une place se vend pour une occurrence datée précise, pas pour l'event "générique"
            // (voir Readme.md — un event a maintenant plusieurs event_dates).
            $table->foreignId('event_date_id')->constrained()->cascadeOnDelete();
            // `event_ticket_type_id` en nullOnDelete (pas cascade) : supprimer un type de place ne
            // doit pas effacer les places déjà vendues. `price` est un instantané du tarif au
            // moment de la vente (copié depuis event_ticket_prices dans
            // EventTicketController::store) — pas une simple référence, pour que l'historique
            // reste exact même si l'event change ses prix plus tard.
            $table->foreignId('event_ticket_type_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('price', 8, 2)->nullable();
            $table->foreignId('client_id')->constrained()->restrictOnDelete();
            // Attribuée seulement à la validation de présence, si l'occurrence a une salle
            // (placement strict) — voir EventTicketController::validateCode.
            $table->foreignId('table_id')->nullable()->constrained('tables')->nullOnDelete();
            // Trace quelle ligne de ticket POS Vente directe a payé cette place (voir
            // TicketController::store, lien fait après paiement) — null tant que la place n'a pas
            // encore été encaissée là-bas. nullOnDelete plutôt que cascade : une place vendue ne
            // doit jamais disparaître parce que son ticket d'origine a été retiré.
            $table->foreignId('ticket_line_id')->nullable()->constrained()->nullOnDelete();
            $table->string('validation_code')->unique();
            $table->timestamp('validated_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('event_tickets');
    }
};
