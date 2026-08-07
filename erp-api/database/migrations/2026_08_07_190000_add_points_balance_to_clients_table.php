<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Solde de points fidélité (voir App\Support\LoyaltyPoints) — jamais dans le `Fillable` de
     * `Client`, mis à jour uniquement via `LoyaltyPoints::apply()` (à l'intérieur de la
     * transaction qui crée un Ticket), jamais depuis une requête utilisateur directe. Colonne
     * dénormalisée plutôt qu'un `SUM` recalculé à chaque lecture : le solde est affiché à chaque
     * sélection de client au paiement (POS Vente directe/Restaurant, kiosque), un aggregate sur
     * `client_point_movements` à chaque écran de paiement serait inutilement coûteux pour une
     * valeur qui ne change qu'une fois par vente.
     */
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->integer('points_balance')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->dropColumn('points_balance');
        });
    }
};
