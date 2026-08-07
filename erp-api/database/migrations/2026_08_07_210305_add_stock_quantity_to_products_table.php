<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Stock optionnel par produit (voir App\Support\StockManager) — `null` par défaut signifie
     * "non suivi" (comportement actuel inchangé, disponibilité illimitée), pas "zéro en stock" :
     * un simple `default(0)` aurait rendu tous les produits existants indisponibles au premier
     * déploiement de cette migration. Décrémenté à chaque vente réelle (jamais à l'ajout au
     * panier/à la commande, qui reste réversible avant paiement).
     */
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->unsignedInteger('stock_quantity')->nullable()->after('is_combo');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('stock_quantity');
        });
    }
};
