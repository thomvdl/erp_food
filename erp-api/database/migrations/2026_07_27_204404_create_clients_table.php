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
        Schema::create('clients', function (Blueprint $table) {
            $table->id();
            $table->string('firstname');
            $table->string('lastname');
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->timestamps();
            // Solde de points fidélité (voir App\Support\LoyaltyPoints) — jamais dans le
            // Fillable de Client, mis à jour uniquement via LoyaltyPoints::apply(). Dénormalisé
            // plutôt qu'un SUM recalculé sur client_point_movements à chaque lecture : affiché à
            // chaque sélection de client au paiement, un aggregate serait inutilement coûteux.
            $table->integer('points_balance')->default(0);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('clients');
    }
};
