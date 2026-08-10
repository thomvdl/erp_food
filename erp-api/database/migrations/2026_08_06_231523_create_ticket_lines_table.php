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
            $table->string('note')->nullable();
            // Recopié depuis order_lines.is_correction au moment du paiement (voir
            // OrderController::pay) — un ticket payé reste figé, mais garde la trace qu'une
            // ligne était une correction plutôt qu'un vrai article vendu.
            $table->boolean('is_correction')->default(false);
            // Snapshot du prix produit au moment de la vente : un ticket déjà payé ne doit
            // jamais recalculer un total différent si le prix du Product change après coup.
            $table->decimal('unit_price', 8, 2);
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
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
