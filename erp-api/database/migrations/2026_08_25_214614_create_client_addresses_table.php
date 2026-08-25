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
        Schema::create('client_addresses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->string('label')->nullable();
            // Toujours le `formatted_address` renvoyé par App\Support\DeliveryZone::checkAddress
            // (Nominatim), jamais le texte brut saisi — revalidé de toute façon à chaque commande
            // (voir ShopCheckoutController::store), stocker le texte normalisé évite juste d'avoir
            // à le reformuler à chaque affichage.
            $table->string('address', 500);
            // Un seul défaut par client — géré en code (voir ShopCustomerAddressController), pas
            // de contrainte DB : même approche que points_balance sur Client.
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('client_addresses');
    }
};
