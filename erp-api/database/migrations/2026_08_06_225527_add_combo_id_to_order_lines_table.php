<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "Éclater en vraies lignes séparées à la commande" (voir OrderLineController::store) : un
     * combo ajouté à une commande crée une OrderLine par composant (product_id = le composant
     * réel, pas le combo) plutôt qu'une seule ligne opaque — chaque poste marque alors SA ligne
     * comme n'importe quel autre produit, sans affecter les autres postes du même combo (bug
     * signalé : "quand je valide dans une station ça le fait pour les deux stations"). `combo_id`
     * garde la trace du combo d'origine (nullOnDelete : supprimer la définition du combo ne doit
     * pas bloquer/casser des lignes déjà commandées) — sert à regrouper/incrémenter les lignes
     * d'un même combo si on en recommande, voir syncCombo().
     */
    public function up(): void
    {
        Schema::table('order_lines', function (Blueprint $table) {
            $table->foreignId('combo_id')->nullable()->after('product_id')->constrained('products')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('order_lines', function (Blueprint $table) {
            $table->dropConstrainedForeignId('combo_id');
        });
    }
};
