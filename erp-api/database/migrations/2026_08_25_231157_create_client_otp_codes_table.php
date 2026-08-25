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
        Schema::create('client_otp_codes', function (Blueprint $table) {
            $table->id();
            $table->string('email');
            // Rempli seulement si un Client existait déjà pour cet email au moment de la demande
            // (voir ShopCustomerController::requestOtp) — jamais mis à jour rétroactivement après
            // verifyOtp() si le compte est créé à cette étape-là, juste un repère pour tracer/
            // purger l'historique par client. cascadeOnDelete : un code n'a plus de sens une fois
            // le client supprimé (même raisonnement que client_point_movements.client_id).
            $table->foreignId('client_id')->nullable()->constrained()->cascadeOnDelete();
            // Renseignés seulement si l'email est inconnu au moment de la demande de code — utilisés
            // pour créer le Client une fois le code vérifié (verifyOtp), jamais avant.
            $table->string('firstname')->nullable();
            $table->string('lastname')->nullable();
            $table->string('code', 6);
            $table->timestamp('expires_at');
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();
            $table->index('email');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('client_otp_codes');
    }
};
