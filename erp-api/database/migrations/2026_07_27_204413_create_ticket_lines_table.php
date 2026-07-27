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
        Schema::create('ticket_lines', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('quantity')->default(1);
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            // Readme.md indiquait "ticket_section" (sans _id) — corrigé en ticket_section_id
            // pour pointer vers l'entité Ticket_section déjà définie.
            $table->foreignId('ticket_section_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ticket_lines');
    }
};
