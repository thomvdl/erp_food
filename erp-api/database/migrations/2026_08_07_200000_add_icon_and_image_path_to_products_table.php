<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Visuel affiché à la place du placeholder emoji automatique (voir PRODUCT_EMOJIS côté
     * front, dupliqué dans kiosk-order.ts/order.ts/pos-vente.ts/order-builder.ts) — mutuellement
     * exclusifs (voir App\Support\ImageUpload) : `icon` est un simple emoji choisi par l'admin,
     * `image_path` un chemin relatif sur le disque `public` (jamais l'URL complète, voir
     * Product::imageUrl()). Uploader une image vide `icon` et inversement.
     */
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('icon', 8)->nullable();
            $table->string('image_path')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['icon', 'image_path']);
        });
    }
};
