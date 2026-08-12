<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use App\Models\ProductCategory;

return new class extends Migration
{
    /**
     * Ordre d'affichage manuel des catégories (voir ProductCategoryController::index, orderBy
     * 'position' au lieu de 'name'). Backfill sur l'ordre alphabétique actuel pour ne rien
     * changer visuellement tant que personne n'a modifié le champ.
     */
    public function up(): void
    {
        Schema::table('product_categories', function (Blueprint $table) {
            $table->unsignedInteger('position')->default(0)->after('name');
        });

        ProductCategory::query()->orderBy('name')->get(['id'])
            ->each(fn (ProductCategory $category, int $index) => $category->update(['position' => $index]));
    }

    public function down(): void
    {
        Schema::table('product_categories', function (Blueprint $table) {
            $table->dropColumn('position');
        });
    }
};
