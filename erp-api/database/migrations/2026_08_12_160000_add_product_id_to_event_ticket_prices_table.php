<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Produit "fantôme" généré/tenu à jour automatiquement pour cette (event, type) — voir
     * EventTicketPriceController::update() — utilisé pour encaisser une place via POS Vente
     * directe sans dupliquer la logique de paiement (Product/Ticket existants). nullOnDelete :
     * le produit est désactivé, jamais supprimé (voir ticket_lines.product_id, restrictOnDelete),
     * donc cette colonne ne devrait en pratique jamais se vider toute seule.
     */
    public function up(): void
    {
        Schema::table('event_ticket_prices', function (Blueprint $table) {
            $table->foreignId('product_id')->nullable()->after('price')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('event_ticket_prices', function (Blueprint $table) {
            $table->dropConstrainedForeignId('product_id');
        });
    }
};
