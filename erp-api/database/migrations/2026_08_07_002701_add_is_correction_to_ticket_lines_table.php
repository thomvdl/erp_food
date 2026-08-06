<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Recopié depuis order_lines.is_correction au moment du paiement (voir OrderController::pay)
     * — un ticket payé reste figé, mais doit garder trace qu'une des lignes était une correction
     * plutôt qu'un vrai article vendu (voir ticket-print.util.ts::ticketLineTotal, ticket-receipt).
     */
    public function up(): void
    {
        Schema::table('ticket_lines', function (Blueprint $table) {
            $table->boolean('is_correction')->default(false)->after('note');
        });
    }

    public function down(): void
    {
        Schema::table('ticket_lines', function (Blueprint $table) {
            $table->dropColumn('is_correction');
        });
    }
};
