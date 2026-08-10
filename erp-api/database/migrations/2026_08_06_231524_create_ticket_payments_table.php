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
        Schema::create('ticket_payments', function (Blueprint $table) {
            $table->id();
            $table->decimal('value', 8, 2);
            $table->foreignId('payment_method_id')->constrained()->restrictOnDelete();
            $table->foreignId('ticket_id')->constrained()->cascadeOnDelete();
            // Qui a encaissé ce paiement, et dans quelle session de caisse — permet de valider
            // les paiements par utilisateur et de reconstituer le montant attendu en espèces à
            // la fermeture d'une session. Nullable : une vente reste possible sans session de
            // caisse ouverte.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('cash_session_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ticket_payments');
    }
};
