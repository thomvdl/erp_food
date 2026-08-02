<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Capacité publique pour erp_self_order (mode QR) : n'importe qui ayant ce token peut
     * composer une commande pour CETTE table/référence précisément, rien d'autre — d'où un
     * jeton aléatoire non devinable plutôt que le slug/libellé (qui, lui, reste prévisible,
     * "table-12"), voir SelfOrderController. Toute table existante (pas seulement celles de
     * salles "self_order") en reçoit un : une table de restaurant classique peut aussi avoir son
     * propre QR pour laisser un client commander sans passer par un serveur.
     *
     * Reste `nullable` en base (pas de ->change(), qui exigerait doctrine/dbal, absent de ce
     * projet) — toujours renseigné en pratique par TableElementController::store, qui le
     * génère systématiquement à la création.
     */
    public function up(): void
    {
        Schema::table('tables', function (Blueprint $table) {
            $table->string('qr_token')->nullable()->unique()->after('label');
        });

        foreach (DB::table('tables')->select('id')->get() as $row) {
            DB::table('tables')->where('id', $row->id)->update(['qr_token' => Str::random(24)]);
        }
    }

    public function down(): void
    {
        Schema::table('tables', function (Blueprint $table) {
            $table->dropColumn('qr_token');
        });
    }
};
