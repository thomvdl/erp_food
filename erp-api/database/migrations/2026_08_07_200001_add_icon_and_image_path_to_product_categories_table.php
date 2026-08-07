<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Même principe que add_icon_and_image_path_to_products_table — voir son docblock. */
    public function up(): void
    {
        Schema::table('product_categories', function (Blueprint $table) {
            $table->string('icon', 8)->nullable();
            $table->string('image_path')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('product_categories', function (Blueprint $table) {
            $table->dropColumn(['icon', 'image_path']);
        });
    }
};
