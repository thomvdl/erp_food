<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Troisième état "Présent" (voir BookingController::markPresent) — `validated_at` existant
     * reste "En attente" -> "Validée", `arrived_at` ajoute "Validée" -> "Présent" sans toucher au
     * sens de `validated_at`. Une réservation présente est toujours passée par validée
     * (markPresent force aussi validated_at si absent), donc arrived_at seul suffit à distinguer
     * les 3 états sans colonne enum séparée.
     */
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->timestamp('arrived_at')->nullable()->after('validated_at');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('arrived_at');
        });
    }
};
