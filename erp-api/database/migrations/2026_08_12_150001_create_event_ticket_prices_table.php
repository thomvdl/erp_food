<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Prix par événement (confirmé explicitement, pas un prix global unique) : chaque event
     * choisit lui-même quels types de place il propose et à quel prix — l'absence de ligne pour
     * un (event, type) donné signifie que ce type n'est pas vendu pour cet event (voir
     * EventTicketPriceController). Toutes les dates du même event partagent ces prix.
     */
    public function up(): void
    {
        Schema::create('event_ticket_prices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('event_ticket_type_id')->constrained()->cascadeOnDelete();
            $table->decimal('price', 8, 2);
            $table->timestamps();
            $table->unique(['event_id', 'event_ticket_type_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('event_ticket_prices');
    }
};
