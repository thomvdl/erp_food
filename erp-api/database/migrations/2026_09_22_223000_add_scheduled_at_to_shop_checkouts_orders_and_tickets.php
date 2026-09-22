<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "Commande différée" côté boutique en ligne (voir App\Support\ShopOpeningHours,
     * ShopCheckoutController::store) : le client choisit "dès que possible" (scheduled_at =
     * null, comportement actuel inchangé) ou un créneau précis, aujourd'hui ou jusqu'à J+5, dans
     * la limite des jours/horaires d'ouverture configurés. Sur les 3 tables où l'info doit être
     * visible : shop_checkouts (figée à la commande, avant paiement), orders (le kitchen display
     * a besoin de savoir POUR QUAND préparer), tickets (affiché sur le reçu). Nullable partout —
     * seule la boutique en ligne l'utilise, jamais le kiosque/vente directe/self-order/restaurant
     * (toujours "maintenant" par nature).
     */
    public function up(): void
    {
        Schema::table('shop_checkouts', function (Blueprint $table) {
            $table->timestamp('scheduled_at')->nullable()->after('fulfillment_type');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->timestamp('scheduled_at')->nullable()->after('fulfillment_type');
        });

        Schema::table('tickets', function (Blueprint $table) {
            $table->timestamp('scheduled_at')->nullable()->after('source');
        });
    }

    public function down(): void
    {
        Schema::table('shop_checkouts', function (Blueprint $table) {
            $table->dropColumn('scheduled_at');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('scheduled_at');
        });

        Schema::table('tickets', function (Blueprint $table) {
            $table->dropColumn('scheduled_at');
        });
    }
};
