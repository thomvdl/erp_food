<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "Tu peux faire pareil sur paramètres passe" — même principe que add_active_to_rooms_table
     * et voisines (voir Readme.md) : pas de suppression pure, un passe se désactive plutôt.
     */
    public function up(): void
    {
        Schema::table('passes', function (Blueprint $table) {
            $table->boolean('active')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('passes', function (Blueprint $table) {
            $table->dropColumn('active');
        });
    }
};
