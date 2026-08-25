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
        Schema::create('clients', function (Blueprint $table) {
            $table->id();
            $table->string('firstname');
            $table->string('lastname');
            // Unique quand renseigné : c'est la clé de connexion par mot de passe
            // (ShopCustomerController::register/authenticate) — un Client créé au POS (jamais de
            // mot de passe) peut toujours en avoir un ou non, mais deux comptes web ne peuvent
            // pas partager le même email.
            $table->string('email')->nullable()->unique();
            $table->string('phone')->nullable();
            // Nullable — la plupart des Client créés au POS n'en ont jamais. Voir
            // ShopCustomerController::register : s'inscrire avec l'email d'un Client existant sans
            // mot de passe encore défini "récupère" ce compte plutôt que d'échouer (assumé — voir
            // docblock de la classe, aucune preuve de possession d'email dans ce flux).
            $table->string('password')->nullable();
            // Compte lié à une connexion Google (voir ShopCustomerController::handleGoogleCallback)
            // — nullable, unique quand renseigné (un compte Google ne peut être lié qu'à un seul
            // Client, mais la plupart des clients n'en auront jamais).
            $table->string('google_id')->nullable()->unique();
            $table->timestamps();
            // Solde de points fidélité (voir App\Support\LoyaltyPoints) — jamais dans le
            // Fillable de Client, mis à jour uniquement via LoyaltyPoints::apply(). Dénormalisé
            // plutôt qu'un SUM recalculé sur client_point_movements à chaque lecture : affiché à
            // chaque sélection de client au paiement, un aggregate serait inutilement coûteux.
            $table->integer('points_balance')->default(0);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('clients');
    }
};
