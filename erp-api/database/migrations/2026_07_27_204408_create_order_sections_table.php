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
        Schema::create('order_sections', function (Blueprint $table) {
            $table->id();
            $table->string('name')->nullable();
            // Readme.md indiquait "ticket_id" sur Order_section — corrigé en order_id, une
            // section appartient à une commande en cours, pas encore à un ticket payé.
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('order_sections');
    }
};
