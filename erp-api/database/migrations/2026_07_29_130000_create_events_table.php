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
        // Un "event" est maintenant juste le spectacle/nom (ex. "Concert de Jazz") — chaque
        // occurrence datée (avec heure, salle, limite de places) vit dans `event_dates`
        // (voir Readme.md : "créer un event puis ajouter des dates, heure, places, room").
        Schema::create('events', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            // Visuel affiché en tête d'événement (voir App\Support\ImageUpload) — même principe
            // que Product/ProductCategory, mais sans `icon` : un event n'a jamais eu de fallback
            // emoji.
            $table->string('image_path')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('events');
    }
};
