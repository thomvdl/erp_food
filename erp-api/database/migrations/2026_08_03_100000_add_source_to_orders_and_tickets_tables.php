<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // "Un champ source pour voir d'où vient le ticket : kiosque / POS Restaurant / POS Vente
        // directe / self-order" — Order a aussi besoin de ce champ : un ticket issu du POS
        // Restaurant est créé par OrderController::pay() à partir d'une Order déjà existante, donc
        // c'est l'Order qui sait si elle a été ouverte par le personnel (pos_restaurant) ou par un
        // client via QR (self_order) ; OrderController::pay() recopie ensuite cette valeur sur le
        // Ticket qu'il crée. Nullable : aucune valeur fiable à rétro-remplir pour les
        // tickets/commandes déjà en base avant cette migration.
        Schema::table('orders', function (Blueprint $table) {
            $table->string('source')->nullable()->after('table_id');
        });

        Schema::table('tickets', function (Blueprint $table) {
            $table->string('source')->nullable()->after('table_id');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('source');
        });

        Schema::table('tickets', function (Blueprint $table) {
            $table->dropColumn('source');
        });
    }
};
