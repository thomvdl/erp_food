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
        Schema::table('ticket_payments', function (Blueprint $table) {
            // Qui a encaissé ce paiement, et dans quelle session de caisse — permet de
            // "valider les paiements par utilisateur" (voir Readme.md) et de reconstituer le
            // montant attendu en espèces à la fermeture d'une session. Nullable : une vente
            // reste possible sans session de caisse ouverte (rétrocompatible avec les paiements
            // déjà en base et avec un usage du POS sans passer par ce module).
            $table->foreignId('user_id')->nullable()->after('ticket_id')->constrained()->nullOnDelete();
            $table->foreignId('cash_session_id')->nullable()->after('user_id')->constrained()->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('ticket_payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('cash_session_id');
            $table->dropConstrainedForeignId('user_id');
        });
    }
};
