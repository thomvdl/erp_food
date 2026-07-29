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
        Schema::create('cash_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->decimal('opening_amount', 8, 2);
            $table->timestamp('opened_at');
            $table->decimal('closing_amount', 8, 2)->nullable();
            // Calculés à la fermeture (opening_amount + paiements espèces rattachés à la
            // session) — pas de colonne 'status' séparée, une session est ouverte tant que
            // closed_at est null.
            $table->decimal('expected_amount', 8, 2)->nullable();
            $table->decimal('discrepancy', 8, 2)->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->foreignId('closed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('note')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cash_sessions');
    }
};
