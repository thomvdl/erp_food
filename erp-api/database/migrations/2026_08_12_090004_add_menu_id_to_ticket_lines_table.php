<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Même rôle que `order_lines.menu_id` : trace le menu d'origine sur les lignes composants
     * générées par un menu (nullOnDelete, ligne déjà figée par `unit_price` de toute façon). Pas
     * de colonne `priced` ici : `ticket_lines.unit_price` est déjà un prix figé par ligne (voir
     * migration create_ticket_lines_table), donc une ligne composant est simplement créée avec
     * `unit_price = 0` — le total (déjà `sum(unit_price * quantity)`) exclut naturellement ces
     * lignes sans changement de calcul.
     */
    public function up(): void
    {
        Schema::table('ticket_lines', function (Blueprint $table) {
            $table->foreignId('menu_id')->nullable()->after('product_id')->constrained('products')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('ticket_lines', function (Blueprint $table) {
            $table->dropConstrainedForeignId('menu_id');
        });
    }
};
