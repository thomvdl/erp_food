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
        Schema::create('tickets', function (Blueprint $table) {
            $table->id();
            $table->timestamp('paid_at')->nullable();
            $table->foreignId('client_id')->nullable()->constrained()->nullOnDelete();
            // Trace la réduction effectivement appliquée (voir DiscountCalculator) — figée au
            // paiement, comme unit_price sur les lignes : si le code est modifié/désactivé après
            // coup, le ticket déjà payé garde le montant réellement déduit. nullOnDelete :
            // supprimer un code plus tard ne casse pas l'historique des tickets qui l'ont utilisé.
            $table->foreignId('discount_id')->nullable()->constrained('discounts')->nullOnDelete();
            $table->decimal('discount_amount', 8, 2)->nullable();
            // Trace l'effet du programme de fidélité sur ce ticket précis (voir
            // App\Support\LoyaltyPoints), figé au paiement pour la même raison que discount_id
            // ci-dessus. points_earned : gagnés sur cette vente (null si pas de client
            // sélectionné). points_redeemed/points_redeemed_amount : utilisés en réduction.
            $table->integer('points_earned')->nullable();
            $table->integer('points_redeemed')->nullable();
            $table->decimal('points_redeemed_amount', 8, 2)->nullable();
            $table->foreignId('table_id')->nullable()->constrained('tables')->nullOnDelete();
            // Voir orders.source : un ticket issu du POS Restaurant recopie la valeur de l'Order
            // dont il est né (OrderController::pay), les autres (kiosk, self_order, pos_vente)
            // sont créés directement avec leur propre source.
            $table->string('source')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tickets');
    }
};
