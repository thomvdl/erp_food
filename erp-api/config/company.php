<?php

// Coordonnées de l'établissement (nom commercial, adresse, téléphone) — distinctes de APP_NAME
// (nom du logiciel) : affichées dans le pied des emails clients (ticket de caisse, confirmation
// de réservation, billets d'événement), pas dans l'interface d'administration.
return [
    'name' => env('COMPANY_NAME'),
    'address' => env('COMPANY_ADDRESS'),
    'phone' => env('COMPANY_PHONE'),
];
