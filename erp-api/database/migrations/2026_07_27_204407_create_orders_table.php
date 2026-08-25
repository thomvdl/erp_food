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
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            // Cycle de vie d'une commande en cuisine, confirmé par l'utilisateur : send (envoyée
            // en cuisine) -> ask (appelée/relancée) -> do (en préparation) -> seed (envoyée en
            // salle) -> done (servie). Valeurs telles quelles (pas de renommage "sent"), pour
            // rester alignées sur le vocabulaire de Readme.md.
            $table->string('state')->default('send');
            $table->foreignId('client_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('table_id')->nullable()->constrained('tables')->nullOnDelete();
            // Repère libre saisi par le client au clavier numérique du kiosque (voir
            // kiosk-order.ts) quand il choisit "sur place" — volontairement PAS une foreignId vers
            // `tables` (un kiosque fast-food n'a pas de plan de salle, juste des numéros de
            // plateau/tente de table).
            $table->string('table_number', 20)->nullable();
            // "Voir d'où vient le ticket : kiosque / POS Restaurant / POS Vente directe /
            // self-order" — porté par l'Order (pas seulement le Ticket) car c'est elle qui sait
            // si elle a été ouverte par le personnel (pos_restaurant) ou par un client via QR
            // (self_order) ; OrderController::pay() recopie ensuite cette valeur sur le Ticket.
            $table->string('source')->nullable();
            // Boutique en ligne (erp_public_shop, voir App\Support\ShopSaleRecorder) : "à
            // emporter" ou "livraison", adresse dans ce dernier cas, nom/téléphone collectés par
            // Stripe Checkout — dénormalisé directement sur l'Order pour que le back-office/
            // kitchen display affichent l'info sans jointure vers shop_checkouts. Nullable : sans
            // objet pour les autres sources (pos_restaurant, self_order, kiosk...).
            $table->string('fulfillment_type')->nullable();
            $table->text('delivery_address')->nullable();
            $table->string('customer_name')->nullable();
            $table->string('customer_phone')->nullable();
            // Cycle de vie DÉDIÉ des commandes "à livrer", indépendant de `orders.state`/
            // `order_sections.state` (POS Restaurant/Kitchen Display) : pending ->
            // out_for_delivery -> delivered (l'Order est supprimée à ce dernier stade, comme une
            // commande kiosque servie) — géré depuis erp-app > Gestion > Livraison (voir
            // OrderController::updateDeliveryStatus). Null pour "à emporter" ou toute autre source.
            $table->string('delivery_status')->nullable();
            // Commande kiosque (voir KioskOrderController) : le Ticket (encaissé immédiatement)
            // et l'Order (visible en cuisine) sont deux enregistrements indépendants créés dans
            // la même transaction — sans ce lien, le numéro affiché au client (celui du Ticket)
            // ne correspondrait pas à celui vu en cuisine (celui de l'Order). Pas de contrainte
            // FK : le Ticket n'est jamais supprimé mais l'Order l'est dès qu'elle est servie,
            // uniquement un repère d'affichage.
            $table->unsignedBigInteger('ticket_id')->nullable();
            // "Ouvrir une table avec le nombre de personnes" — appartient à la commande (une
            // visite précise), pas à la table elle-même (pas de notion de capacité physique).
            $table->unsignedInteger('number_of_guests')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
