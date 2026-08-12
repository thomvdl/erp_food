<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * `price` est un instantané du tarif au moment de la vente (copié depuis event_ticket_prices
     * dans EventTicketController::store) — pas une simple référence, pour que l'historique reste
     * exact même si l'event change ses prix plus tard. `event_ticket_type_id` en nullOnDelete
     * (pas cascade) : supprimer un type de place ne doit pas effacer les places déjà vendues.
     */
    public function up(): void
    {
        Schema::table('event_tickets', function (Blueprint $table) {
            $table->foreignId('event_ticket_type_id')->nullable()->after('event_date_id')->constrained()->nullOnDelete();
            $table->decimal('price', 8, 2)->nullable()->after('event_ticket_type_id');
        });
    }

    public function down(): void
    {
        Schema::table('event_tickets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('event_ticket_type_id');
            $table->dropColumn('price');
        });
    }
};
