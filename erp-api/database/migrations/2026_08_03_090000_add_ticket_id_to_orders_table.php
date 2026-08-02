<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            // Commande kiosque (voir KioskOrderController) : le Ticket (encaissé immédiatement) et
            // l'Order (visible en cuisine) sont deux enregistrements indépendants créés dans la
            // même transaction, donc deux ids différents par défaut — sans ce lien, le numéro
            // affiché au client (celui de son Ticket) ne correspondrait pas à celui vu en cuisine
            // (celui de l'Order), rendant impossible d'appeler le bon numéro pour remettre la
            // commande au bon client. Pas de contrainte FK : le Ticket n'est jamais supprimé mais
            // l'Order l'est dès qu'elle est servie (voir OrderSectionController::envoyer),
            // uniquement un repère d'affichage.
            $table->unsignedBigInteger('ticket_id')->nullable()->after('table_id');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('ticket_id');
        });
    }
};
