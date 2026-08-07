<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Seuil d'éligibilité optionnel : montant d'achat minimum requis pour pouvoir utiliser le
     * code (voir DiscountCalculator::amountOff) — en dessous, le code est refusé. Une fois le
     * seuil atteint, la réduction s'applique toujours en entier (pas de plafonnement). Null =
     * pas de seuil, utilisable quel que soit le montant du panier.
     */
    public function up(): void
    {
        Schema::table('discounts', function (Blueprint $table) {
            $table->decimal('minimum_total', 8, 2)->nullable()->after('value');
        });
    }

    public function down(): void
    {
        Schema::table('discounts', function (Blueprint $table) {
            $table->dropColumn('minimum_total');
        });
    }
};
