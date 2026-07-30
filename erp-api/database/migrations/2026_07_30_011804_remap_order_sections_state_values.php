<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Aligne le vocabulaire d'état des order_sections sur celui déjà utilisé par orders.state (voir
 * Readme.md : "donc la order section (Send -> Ask -> Do -> Seed -> Done)") — remplace le
 * vocabulaire ad-hoc introduit une première fois (demande/fait/envoye) par les mêmes noms que le
 * cycle de la commande. 'en_attente' reste tel quel : c'est l'état "pas encore validée" avant
 * même d'entrer dans ce cycle nommé (pas de bouton "valider" tant qu'aucun article n'est ajouté),
 * pas une valeur du cycle officiel Send/Ask/Do/Seed/Done.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('order_sections')->where('state', 'demande')->update(['state' => 'ask']);
        DB::table('order_sections')->where('state', 'fait')->update(['state' => 'do']);
        DB::table('order_sections')->where('state', 'envoye')->update(['state' => 'seed']);
    }

    public function down(): void
    {
        DB::table('order_sections')->where('state', 'ask')->update(['state' => 'demande']);
        DB::table('order_sections')->where('state', 'do')->update(['state' => 'fait']);
        DB::table('order_sections')->where('state', 'seed')->update(['state' => 'envoye']);
    }
};
