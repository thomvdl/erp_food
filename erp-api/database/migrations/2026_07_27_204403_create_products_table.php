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
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->decimal('price', 8, 2);
            // Minutes estimées, sert au kitchen display à afficher un minuteur par section une
            // fois demandée (voir order_sections.asked_at). Nullable : pas de valeur inventée
            // pour les produits sans temps configuré, ils n'affichent simplement pas de minuteur.
            $table->unsignedInteger('preparation_time')->nullable();
            $table->string('sku')->nullable()->unique();
            $table->boolean('active')->default(true);
            // Un combo est un Product comme un autre (même prix/taxe/catalogues/panier/ticket) —
            // is_combo sert juste à savoir qu'il faut charger sa composition (product_components).
            $table->boolean('is_combo')->default(false);
            // Stock optionnel (voir App\Support\StockManager) — null = non suivi (disponibilité
            // illimitée), décrémenté uniquement à la vente réelle, jamais à l'ajout au panier.
            $table->unsignedInteger('stock_quantity')->nullable();
            $table->foreignId('tax_id')->nullable()->constrained('taxes')->nullOnDelete();
            $table->foreignId('station_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('product_category_id')->nullable()->constrained('product_categories')->nullOnDelete();
            // Plus de product_catalog_id ici : un produit peut appartenir à plusieurs catalogues
            // et un catalogue à plusieurs produits, voir la table pivot catalog_product créée
            // dans une migration séparée (2026_07_28_..._create_catalog_product_table.php).
            $table->timestamps();
            // Visuel affiché à la place du placeholder emoji automatique — mutuellement
            // exclusifs (voir App\Support\ImageUpload) : icon un simple emoji choisi par
            // l'admin, image_path un chemin relatif sur le disque public (jamais l'URL
            // complète, voir Product::imageUrl()).
            $table->string('icon', 8)->nullable();
            $table->string('image_path')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
