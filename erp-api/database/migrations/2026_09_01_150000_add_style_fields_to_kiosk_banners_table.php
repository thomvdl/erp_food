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
        Schema::table('kiosk_banners', function (Blueprint $table) {
            // Utilisé quand image_path est vide — sans ça, une bannière sans image affiche un fond
            // transparent (voir KioskBanner::imageUrl, image_url alors null).
            $table->string('background_color', 9)->nullable()->after('image_path');
            $table->string('text_position')->default('bottom')->after('background_color');
            $table->string('text_size')->default('medium')->after('text_position');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('kiosk_banners', function (Blueprint $table) {
            $table->dropColumn(['background_color', 'text_position', 'text_size']);
        });
    }
};
