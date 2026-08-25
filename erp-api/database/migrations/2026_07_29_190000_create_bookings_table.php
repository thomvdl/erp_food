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
        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('number_of_guests');
            // Chaîne libre + validation 'in:' côté contrôleur plutôt qu'un enum MySQL natif —
            // même convention que rooms.type.
            $table->string('type');
            $table->date('date');
            $table->time('hour');
            $table->timestamp('validated_at')->nullable();
            // Troisième état "Présent" (voir BookingController::markPresent) — validated_at reste
            // "En attente" -> "Validée", arrived_at ajoute "Validée" -> "Présent". Une réservation
            // présente est toujours passée par validée (markPresent force aussi validated_at si
            // absent), donc arrived_at seul suffit à distinguer les 3 états sans colonne enum.
            $table->timestamp('arrived_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bookings');
    }
};
