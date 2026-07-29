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
            // Snapshot du prix produit au moment de la vente (risque identifié dans CONTEXT.md,
            // corrigé ici avant de construire le paiement) : un ticket déjà payé ne doit jamais
            // recalculer un total différent si le prix du Product change après coup.
            $table->decimal('unit_price', 8, 2);
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
