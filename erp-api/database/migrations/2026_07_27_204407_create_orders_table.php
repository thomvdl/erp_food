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
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            // Cycle de vie d'une commande en cuisine, confirmé par l'utilisateur : send (envoyée
            // en cuisine) -> ask (appelée/relancée) -> do (en préparation) -> seed (envoyée en
            // salle) -> done (servie). Valeurs telles quelles (pas de renommage "sent"), pour
            // rester alignées sur le vocabulaire de Readme.md.
            $table->string('state')->default('send');
            $table->foreignId('client_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('table_id')->nullable()->constrained('tables')->nullOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
