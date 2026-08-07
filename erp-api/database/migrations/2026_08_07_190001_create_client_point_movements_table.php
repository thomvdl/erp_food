<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Historique des mouvements de points fidélité (voir App\Support\LoyaltyPoints) — utilisé par
     * la fiche client 360° pour afficher le détail des gains/dépenses, `clients.points_balance`
     * reste la valeur de référence pour l'affichage courant (ce n'est pas recalculé depuis cette
     * table à chaque lecture, voir migration add_points_balance_to_clients_table). `points` signé
     * : positif = gagné, négatif = utilisé — jusqu'à deux lignes par ticket (un gain ET une
     * dépense sur la même vente sont possibles, voir le cumul promo+points). `ticket_id` nullable
     * + `nullOnDelete` : même raisonnement que `tickets.discount_id` (un ticket payé n'est en
     * pratique jamais supprimé, mais ne pas faire dépendre l'intégrité de cette table de cette
     * garantie). `client_id` en `cascadeOnDelete` : contrairement au ticket (pièce comptable
     * figée), l'historique de points n'a plus de sens une fois le client supprimé.
     */
    public function up(): void
    {
        Schema::create('client_point_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained('clients')->cascadeOnDelete();
            $table->foreignId('ticket_id')->nullable()->constrained('tickets')->nullOnDelete();
            $table->integer('points');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_point_movements');
    }
};
