<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `paid_at` est la colonne de filtre/tri de Gestion des tickets, Rapports et l'export comptable
 * (voir TicketController::index, ReportController, App\Support\AccountingExport) — table jamais
 * purgée (contrairement à orders), donc un scan complet de plus en plus coûteux sans index.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->index('paid_at');
        });
    }

    public function down(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->dropIndex(['paid_at']);
        });
    }
};
