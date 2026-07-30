<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Voir add_active_to_rooms_table (même migration jumelle, "tables et salles" du Readme.md). */
    public function up(): void
    {
        Schema::table('tables', function (Blueprint $table) {
            $table->boolean('active')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('tables', function (Blueprint $table) {
            $table->dropColumn('active');
        });
    }
};
