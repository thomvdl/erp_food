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
        Schema::create('event_tickets', function (Blueprint $table) {
            $table->id();
            // Une place se vend pour une occurrence datée précise, pas pour l'event "générique"
            // (voir Readme.md — un event a maintenant plusieurs event_dates).
            $table->foreignId('event_date_id')->constrained()->cascadeOnDelete();
            $table->foreignId('client_id')->constrained()->restrictOnDelete();
            // Attribuée seulement à la validation de présence, si l'occurrence a une salle
            // (placement strict) — voir EventTicketController::validateCode.
            $table->foreignId('table_id')->nullable()->constrained('tables')->nullOnDelete();
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
