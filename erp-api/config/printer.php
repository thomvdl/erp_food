<?php

// Imprimante thermique réseau (ESC/POS, port raw 9100) — voir App\Support\ThermalReceipt.
// PRINTER_HOST vide = fonctionnalité désactivée (bouton "Imprimer (thermique)" masqué côté front,
// voir CompanyController-like TicketController::printerStatus).
return [
    'host' => env('PRINTER_HOST'),
    'port' => env('PRINTER_PORT', 9100),
    // Largeur du papier en caractères avec la police par défaut — 42 pour du 58mm, 48 pour du 80mm.
    'chars_per_line' => env('PRINTER_CHARS_PER_LINE', 42),
];
