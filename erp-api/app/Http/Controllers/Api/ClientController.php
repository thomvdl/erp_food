<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use Illuminate\Http\Request;

class ClientController extends Controller
{
    /**
     * Double usage : sélecteur client du POS Vente directe (recherche libre `q` sur
     * prénom/nom/email/téléphone, résultats limités à 20) ET page Paramètres > Gestion des
     * clients (pas de `q` => liste complète, sans limite).
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
            })->limit(20);
        }

        return $query->orderBy('lastname')->get();
    }

    /**
     * Utilisé à la fois par la création rapide depuis le POS ("+ Nouveau client") et par la page
     * Gestion des clients.
     */
    public function store(Request $request)
    {
        return response()->json(Client::query()->create($this->validated($request)), 201);
    }

    public function show(Client $client)
    {
        return $client;
    }

    public function update(Request $request, Client $client)
    {
        $client->update($this->validated($request));

        return $client;
    }

    public function destroy(Client $client)
    {
        $client->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'firstname' => ['required', 'string', 'max:255'],
            'lastname' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
        ]);
    }
}
