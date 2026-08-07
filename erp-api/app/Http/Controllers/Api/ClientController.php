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
     * "Connexion" client sur le kiosque (voir Readme.md) — contrairement à index(), une
     * correspondance EXACTE uniquement sur le téléphone, jamais de liste : le kiosque est un
     * appareil public, montrer plusieurs clients réels en tapant un numéro partiel serait une
     * fuite de données (noms/téléphones d'autres clients visibles par n'importe qui). `null` si
     * aucun client ne correspond — le front propose alors d'en créer un (voir POST /clients).
     */
    public function lookup(Request $request)
    {
        $data = $request->validate(['phone' => ['required', 'string']]);

        return response()->json(Client::query()->where('phone', $data['phone'])->first());
    }

    /**
     * Utilisé à la fois par la création rapide depuis le POS ("+ Nouveau client") et par la page
     * Gestion des clients.
     */
    public function store(Request $request)
    {
        return response()->json(Client::query()->create($this->validated($request)), 201);
    }

    /**
     * Double usage : formulaire d'édition (`ClientForm` côté erp-app, ne lit que
     * firstname/lastname/email/phone) ET fiche client 360° (`ClientDetail`, lit tout le reste) —
     * un seul endpoint réutilisé plutôt qu'une route dédiée, l'édition ignore simplement les
     * champs qu'elle ne bind pas. `points_balance` est chargé nativement avec le modèle (colonne
     * directe, voir migration add_points_balance_to_clients_table) ; `pointMovements` apporte le
     * détail (fiche 360° uniquement).
     */
    public function show(Client $client)
    {
        return $client->load([
            'tickets' => fn ($query) => $query->latest('paid_at'),
            'tickets.sections.lines.product',
            'tickets.payments.paymentMethod',
            'tickets.discount',
            'bookings' => fn ($query) => $query->latest('date'),
            'eventTickets' => fn ($query) => $query->latest('id'),
            'eventTickets.eventDate.event',
            'pointMovements' => fn ($query) => $query->latest('id'),
        ]);
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
