<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use Illuminate\Http\Request;

class ClientController extends Controller
{
    /**
     * Utilisé par le sélecteur client du POS Vente directe : recherche libre sur
     * prénom/nom/email/téléphone, résultats limités (pas une page CRUD complète pour l'instant).
     */
    public function index(Request $request)
    {
        $query = Client::query();

        if ($search = $request->query('q')) {
            $query->where(function ($q) use ($search) {
                $q->where('firstname', 'like', "%{$search}%")
                    ->orWhere('lastname', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        return $query->orderBy('lastname')->limit(20)->get();
    }

    /**
     * Création rapide depuis le POS ("+ Nouveau client") — pas de page Client dédiée pour l'instant.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'firstname' => ['required', 'string', 'max:255'],
            'lastname' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
        ]);

        return response()->json(Client::query()->create($data), 201);
    }
}
