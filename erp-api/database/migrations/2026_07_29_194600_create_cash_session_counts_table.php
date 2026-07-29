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
        Schema::create('cash_session_counts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cash_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payment_method_id')->constrained()->restrictOnDelete();
            // Espèces attendu inclut le fond d'ouverture (voir CashSessionController::close),
            // les autres moyens de paiement n'ont que la somme des ventes de la session.
            $table->decimal('expected_amount', 8, 2);
            $table->decimal('counted_amount', 8, 2);
            $table->decimal('discrepancy', 8, 2);
            $table->timestamps();
            $table->unique(['cash_session_id', 'payment_method_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cash_session_counts');
    }
};
