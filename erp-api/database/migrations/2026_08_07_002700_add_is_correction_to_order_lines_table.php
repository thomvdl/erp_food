<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "Corriger une commande si il y a un produit en trop" : une ligne de correction reste un
     * produit normal (même product_id, même quantity POSITIVE — pas de `->change()` sur
     * `quantity` en unsignedInteger, qui exigerait doctrine/dbal, absent de ce projet, voir
     * add_qr_token_to_tables_table) mais ce flag inverse son effet sur le total (voir
     * OrderController::pay et order-builder.ts::lineTotal) — "mettre le produit avec le montant
     * en négatif" sans jamais stocker de quantité négative en base. `done`/`sent` sont forcés à
     * true à la création (voir OrderController::correction) : une correction ne repasse jamais
     * par la cuisine, uniquement par le kitchen display qui exclut déjà les sections 'seed'
     * (seul état où une correction est autorisée).
     */
    public function up(): void
    {
        Schema::table('order_lines', function (Blueprint $table) {
            $table->boolean('is_correction')->default(false)->after('sent');
        });
    }

    public function down(): void
    {
        Schema::table('order_lines', function (Blueprint $table) {
            $table->dropColumn('is_correction');
        });
    }
};
