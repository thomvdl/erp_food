<?php

use App\Models\ProductCategory;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Simplification : on n'encaisse plus une place via POS Vente directe (panier/catalogue,
     * abandonné) mais via une modale de paiement dédiée dans EventDashboard (voir
     * EventTicketController::pay) — un seul Product générique suffit pour satisfaire la
     * contrainte FK de ticket_lines.product_id, le vrai montant vient toujours de
     * ticket_lines.unit_price (jamais de Product::price). Plus besoin d'un Product par (event,
     * type) ni du catalogue "Billets événements" (rien ne parcourt plus une grille produits).
     */
    public function up(): void
    {
        Schema::table('event_ticket_prices', function (Blueprint $table) {
            $table->dropConstrainedForeignId('product_id');
        });

        DB::table('product_catalogs')->where('slug', 'billets-evenements')->delete();

        DB::table('products')->insert([
            'name' => 'Billet événement',
            'slug' => 'billet-evenement',
            'price' => 0,
            'active' => true,
            'product_category_id' => ProductCategory::query()->where('slug', 'billets-evenements')->value('id'),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('products')->where('slug', 'billet-evenement')->delete();

        DB::table('product_catalogs')->insert([
            'name' => 'Billets événements',
            'slug' => 'billets-evenements',
            'active' => true,
            'active_restaurant' => false,
            'active_direct_sale' => true,
            'active_self_order' => false,
            'active_kiosk' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Schema::table('event_ticket_prices', function (Blueprint $table) {
            $table->foreignId('product_id')->nullable()->after('price')->constrained()->nullOnDelete();
        });
    }
};
