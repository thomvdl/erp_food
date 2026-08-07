<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Marque qu'une section a déjà décrémenté le stock de ses produits — le stock est désormais
     * consommé DÈS que la section atteint son premier état "engagé" (le vrai moment où la cuisine
     * commence à préparer), pas au paiement final qui peut arriver bien plus tard :
     * OrderSectionController::valider() pour une section POS Restaurant (dès sa validation par le
     * staff), SelfOrderController::store() pour une section self-order (dès sa soumission — elle
     * part directement en 'ask', un cran plus engagée qu'une simple validation, voir
     * App\Support\StockManager). default(false) : toute section déjà en base (validée ou non sous
     * l'ancien comportement) doit encore voir son stock décrémenté une fois au paiement —
     * OrderController::pay() filtre sur cette colonne pour ne jamais décrémenter deux fois.
     */
    public function up(): void
    {
        Schema::table('order_sections', function (Blueprint $table) {
            $table->boolean('stock_consumed')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('order_sections', function (Blueprint $table) {
            $table->dropColumn('stock_consumed');
        });
    }
};
