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
        Schema::create('stations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            // "C'est dans station qu'on doit pouvoir choisir dans quelle passe ça doit aller"
            // (voir Readme.md) : stations.passe_id, PLUSIEURS stations peuvent partager un même
            // passe — modélise mieux la réalité d'une cuisine (un même point d'expédition dessert
            // souvent plusieurs postes).
            $table->foreignId('passe_id')->nullable()->constrained('passes')->nullOnDelete();
            $table->timestamps();
            $table->boolean('active')->default(true);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stations');
    }
};
