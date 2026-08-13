<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Visuel affiché en tête d'événement (voir App\Support\ImageUpload) — même principe que
     * Product/ProductCategory, mais sans `icon` : un event n'a jamais eu de fallback emoji.
     */
    public function up(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->string('image_path')->nullable()->after('slug');
        });
    }

    public function down(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->dropColumn('image_path');
        });
    }
};
