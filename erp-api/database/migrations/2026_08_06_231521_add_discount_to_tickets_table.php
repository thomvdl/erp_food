<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Trace la réduction effectivement appliquée à ce ticket (voir DiscountCalculator) — figée
     * au moment du paiement, comme unit_price sur les lignes : si le code est modifié/désactivé
     * après coup, le ticket déjà payé garde le montant réellement déduit. nullOnDelete sur
     * discount_id : supprimer un code plus tard ne doit pas casser l'historique des tickets qui
     * l'ont utilisé (juste perdre le lien vers sa définition).
     */
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->foreignId('discount_id')->nullable()->after('client_id')->constrained('discounts')->nullOnDelete();
            $table->decimal('discount_amount', 8, 2)->nullable()->after('discount_id');
        });
    }

    public function down(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('discount_id');
            $table->dropColumn('discount_amount');
        });
    }
};
