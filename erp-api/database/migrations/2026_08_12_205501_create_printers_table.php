<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Une imprimante thermique réseau par poste physique (ex. "Caisse bar", "Kiosque 1") — voir
     * App\Support\ThermalReceipt::print(), qui utilisait jusqu'ici une IP unique globale
     * (Param "ip_printer_kiosk" / .env PRINTER_HOST) pour tout le système. Chaque navigateur
     * (kiosque ou poste POS) mémorise en local l'imprimante choisie pour CE poste (voir
     * ActivePrinterService côté erp-app/erp_kiosk) et l'envoie au moment d'imprimer — même
     * pattern "active" que les autres listes de référence (rooms/stations/taxes/...), pas de
     * suppression dure, voir Readme.md.
     */
    public function up(): void
    {
        Schema::create('printers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('ip_address');
            $table->unsignedSmallInteger('port')->default(9100);
            // Largeur papier en caractères (police par défaut) — null = utilise le réglage
            // global config('printer.chars_per_line') comme avant cette table (58mm/80mm peuvent
            // coexister d'un poste à l'autre).
            $table->unsignedTinyInteger('chars_per_line')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('printers');
    }
};
