<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * `is_menu` sert juste à savoir qu'il faut charger sa composition (menuGroups) — même rôle
     * que `is_combo` pour `product_components`, mais un menu compose par GROUPES DE CHOIX (le
     * client choisit un ou plusieurs produits par groupe) plutôt que par une liste fixe.
     */
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->boolean('is_menu')->default(false)->after('is_combo');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('is_menu');
        });
    }
};
