<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Boutique en ligne, commandes "à livrer" uniquement (voir App\Support\ShopSaleRecorder et
     * fulfillment_type) — cycle de vie DÉDIÉ, indépendant de `orders.state`/`order_sections.state`
     * (POS Restaurant/Kitchen Display) : une commande à livrer n'apparaît volontairement jamais au
     * Kitchen Display (voir erp_kitchen_display > kitchen-board.ts), donc rien n'y fait jamais
     * progresser ses sections — sans ce statut séparé, géré depuis erp-app > Gestion > Livraison
     * (voir OrderController::updateDeliveryStatus), une commande à livrer resterait indéfiniment
     * bloquée en base sans jamais pouvoir être nettoyée. pending -> out_for_delivery -> delivered
     * (l'Order est supprimée à ce dernier stade, comme une commande kiosque servie — déjà payée
     * via son Ticket, voir OrderSectionController::envoyer pour le même principe côté kitchen).
     * Null pour toute commande "à emporter" ou de toute autre source.
     */
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('delivery_status')->nullable()->after('customer_phone');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('delivery_status');
        });
    }
};
