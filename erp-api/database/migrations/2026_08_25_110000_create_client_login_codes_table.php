<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('client_login_codes', function (Blueprint $table) {
            $table->id();
            $table->string('phone');
            $table->string('email');
            // Renseignés seulement si le numéro est inconnu au moment de la demande de code (voir
            // ShopCustomerController::requestCode) — utilisés pour créer le Client une fois le
            // code vérifié (verifyCode), jamais avant.
            $table->string('firstname')->nullable();
            $table->string('lastname')->nullable();
            $table->string('code', 6);
            $table->timestamp('expires_at');
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();
            $table->index(['phone', 'email']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_login_codes');
    }
};
