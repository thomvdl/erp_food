<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Trace l'effet du programme de fidélité sur ce ticket précis (voir
     * App\Support\LoyaltyPoints) — figé au paiement, même principe que discount_id/discount_amount
     * (migration add_discount_to_tickets_table) : si le taux d'acquisition/de rachat change plus
     * tard, un ticket déjà payé garde les valeurs réellement appliquées au moment de la vente.
     * points_earned : gagnés sur cette vente (null si pas de client sélectionné). points_redeemed/
     * points_redeemed_amount : utilisés en réduction sur cette vente (null si aucun point utilisé).
     */
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->integer('points_earned')->nullable()->after('discount_amount');
            $table->integer('points_redeemed')->nullable()->after('points_earned');
            $table->decimal('points_redeemed_amount', 8, 2)->nullable()->after('points_redeemed');
        });
    }

    public function down(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->dropColumn(['points_earned', 'points_redeemed', 'points_redeemed_amount']);
        });
    }
};
