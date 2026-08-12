<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Catalogue + catégorie "système" dédiés aux produits fantômes générés par
     * EventTicketPriceController — isolés de la vraie carte (jamais actifs pour restaurant/self-
     * order/kiosk, jamais listés dans l'UI produits normale) mais actifs pour POS Vente directe en
     * permanence, pour que ces produits apparaissent au moment d'encaisser une place (voir
     * pos-vente.ts, redirection depuis EventDashboard). Slugs fixes : le code les retrouve par
     * slug plutôt que par id (voir EventTicketPriceController::ticketCatalog/ticketCategory).
     */
    public function up(): void
    {
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

        DB::table('product_categories')->insert([
            'name' => 'Billets événements',
            'slug' => 'billets-evenements',
            'position' => 0,
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('product_catalogs')->where('slug', 'billets-evenements')->delete();
        DB::table('product_categories')->where('slug', 'billets-evenements')->delete();
    }
};
