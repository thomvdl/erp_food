<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Liste globale et réutilisable entre tous les events (ex. Adulte/Étudiant/Senior) — voir
     * event_ticket_prices pour le prix, propre à chaque event. Même pattern "active" que les
     * autres listes de référence (rooms/categories/...) : pas de suppression dure, voir Readme.md.
     */
    public function up(): void
    {
        Schema::create('event_ticket_types', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->unsignedInteger('position')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('event_ticket_types');
    }
};
