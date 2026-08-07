<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Codes de réduction utilisables au paiement (POS Restaurant, POS Vente directe, Kiosk —
     * voir App\Support\DiscountCalculator). Trois types mutuellement exclusifs (voir `type`) :
     * - percentage    : `value` = % du total (0-100).
     * - fixed_amount  : `value` = montant fixe déduit du total (plafonné au total, jamais négatif).
     * - free_product  : `free_product_id` = le produit offert (doit être présent dans la
     *   commande pour que le code s'applique — voir DiscountCalculator::freeProductAmount).
     * Illimité en nombre d'utilisations pendant [starts_at, ends_at] pour cette première version
     * (pas de table de suivi des utilisations) — `active` permet de désactiver un code sans le
     * supprimer, même convention que taxes/stations/etc.
     */
    public function up(): void
    {
        Schema::create('discounts', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('type');
            $table->decimal('value', 8, 2)->nullable();
            $table->foreignId('free_product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->date('starts_at');
            $table->date('ends_at');
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('discounts');
    }
};
