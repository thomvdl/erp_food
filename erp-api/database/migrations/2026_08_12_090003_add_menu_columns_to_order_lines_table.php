<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Un menu ajouté à une commande crée une OrderLine par produit choisi (product_id = le
     * produit réellement choisi, pas le menu — même principe que `combo_id`) PLUS une ligne
     * "porteuse" (product_id = le menu lui-même) qui porte le prix fixe du menu. `menu_id` garde
     * la trace du menu d'origine (nullOnDelete : supprimer la définition du menu ne doit pas
     * casser des lignes déjà commandées) sur les lignes composants, pas sur la ligne porteuse.
     *
     * `priced` distingue les deux : la ligne porteuse (priced=true, comme n'importe quel produit)
     * est ce qui compte dans le total ; les lignes composants (priced=false) sont là uniquement
     * pour que chaque poste de cuisine voie ce qu'il doit préparer, sans être facturées en plus
     * (sinon on facturerait le menu ET la somme de ses composants). Défaut `true` : ne change
     * rien au comportement existant des combos ni des lignes normales.
     */
    public function up(): void
    {
        Schema::table('order_lines', function (Blueprint $table) {
            $table->foreignId('menu_id')->nullable()->after('combo_id')->constrained('products')->nullOnDelete();
            $table->boolean('priced')->default(true)->after('is_correction');
        });
    }

    public function down(): void
    {
        Schema::table('order_lines', function (Blueprint $table) {
            $table->dropConstrainedForeignId('menu_id');
            $table->dropColumn('priced');
        });
    }
};
