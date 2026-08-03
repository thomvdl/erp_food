<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Temps de préparation estimé (en minutes) — sert au kitchen display à afficher un
        // minuteur par section une fois demandée (voir order_sections.asked_at ci-dessous et
        // erp_kitchen_display/kitchen-board.ts). Nullable : les produits sans valeur configurée
        // n'affichent simplement pas de minuteur, pas de valeur par défaut inventée.
        Schema::table('products', function (Blueprint $table) {
            $table->unsignedInteger('preparation_time')->nullable()->after('price');
        });

        // Horodatage explicite de la transition 'ask' (voir OrderSectionController::demander) —
        // nécessaire pour calculer le temps écoulé/restant du minuteur, plutôt que de se reposer
        // implicitement sur updated_at (qui serait aussi modifié par d'autres opérations sur la
        // ligne sans que ce soit le moment réel où la section a été demandée).
        Schema::table('order_sections', function (Blueprint $table) {
            $table->timestamp('asked_at')->nullable()->after('state');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('preparation_time');
        });

        Schema::table('order_sections', function (Blueprint $table) {
            $table->dropColumn('asked_at');
        });
    }
};
