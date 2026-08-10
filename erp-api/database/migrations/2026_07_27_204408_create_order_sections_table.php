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
        Schema::create('order_sections', function (Blueprint $table) {
            $table->id();
            $table->string('name')->nullable();
            // Readme.md indiquait "ticket_id" sur Order_section — corrigé en order_id, une
            // section appartient à une commande en cours, pas encore à un ticket payé.
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            // Cycle kitchen display : en_attente (défaut, section en cours de composition en
            // salle, pas encore de bouton "valider" tant qu'aucun article n'est ajouté) -> ask
            // (validée/envoyée en cuisine) -> do (un poste l'a marquée prête) -> seed (envoyée en
            // salle) -> done. Mêmes noms que orders.state (Send -> Ask -> Do -> Seed -> Done, voir
            // Readme.md), alignés volontairement sur le même vocabulaire.
            $table->string('state')->default('en_attente');
            // Horodatage explicite de la transition 'ask' (voir OrderSectionController::demander)
            // — nécessaire pour calculer le temps écoulé/restant du minuteur (voir
            // products.preparation_time), plutôt que de se reposer sur updated_at qui serait
            // aussi modifié par d'autres opérations sur la section.
            $table->timestamp('asked_at')->nullable();
            $table->timestamps();
            // Marque que cette section a déjà décrémenté le stock de ses produits — consommé DÈS
            // qu'une section atteint son premier état "engagé" (validation staff ou soumission
            // self-order), pas au paiement final qui peut arriver bien plus tard. Voir
            // App\Support\StockManager et OrderController::pay() qui filtre sur cette colonne
            // pour ne jamais décrémenter deux fois.
            $table->boolean('stock_consumed')->default(false);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('order_sections');
    }
};
