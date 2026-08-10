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
        Schema::create('tables', function (Blueprint $table) {
            $table->id();
            $table->string('type');
            $table->string('label')->nullable();
            // Capacité publique pour erp_self_order (mode QR) : n'importe qui ayant ce token
            // peut composer une commande pour CETTE table précisément — jeton aléatoire non
            // devinable plutôt que le slug/libellé (prévisible, "table-12"), voir
            // SelfOrderController. Toute table en reçoit un, pas seulement celles des salles
            // "self_order" : une table de restaurant classique peut aussi avoir son propre QR.
            $table->string('qr_token')->nullable()->unique();
            $table->integer('pos_left');
            $table->integer('pos_top');
            $table->integer('width');
            $table->integer('height');
            $table->foreignId('room_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->boolean('active')->default(true);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tables');
    }
};
