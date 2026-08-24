<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\ClientLoginCodeMail;
use App\Models\Client;
use App\Models\ClientLoginCode;
use App\Models\Ticket;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

/**
 * Compte client optionnel de la boutique en ligne (erp_public_shop), identifié par numéro de
 * téléphone + email vérifié par code — jamais obligatoire pour commander (voir
 * ShopCheckoutController::store, qui reste utilisable en anonyme). Une identification par
 * téléphone seul avait été envisagée (même niveau de confiance que la recherche client déjà
 * utilisée sans mot de passe au kiosque/POS) mais jugée trop faible pour exposer un historique de
 * commandes/solde de points : n'importe qui connaissant un numéro aurait pu s'y "connecter". Le
 * code envoyé par email (voir requestCode/verifyCode) prouve la possession de l'adresse, sans
 * dépendre d'un service SMS tiers payant (email déjà envoyé pour les tickets/réservations, voir
 * App\Mail). Toute action sensible (historique, points) reroute systématiquement PAR LE NUMÉRO,
 * jamais par un `client_id` brut envoyé par le front.
 */
class ShopCustomerController extends Controller
{
    /**
     * Étape 1 — envoie un code à 6 chiffres à l'email fourni (voir ClientLoginCodeMail), valable
     * 10 minutes. Numéro déjà connu -> code envoyé, `verifyCode` retrouvera ce client. Numéro
     * inconnu sans nom -> `{exists: false}` (le front redemande prénom/nom avant de rappeler avec,
     * nécessaires pour créer le Client — voir migration create_clients_table). Numéro inconnu avec
     * nom -> code envoyé, le nom est mémorisé sur la ligne `client_login_codes` en attendant la
     * vérification (jamais de Client créé avant que le code soit prouvé).
     */
    public function requestCode(Request $request)
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:50'],
            'email' => ['required', 'email', 'max:255'],
            'firstname' => ['nullable', 'string', 'max:255'],
            'lastname' => ['nullable', 'string', 'max:255'],
        ]);

        $existingClient = Client::query()->where('phone', $data['phone'])->first();

        if (!$existingClient && (empty($data['firstname']) || empty($data['lastname']))) {
            return response()->json(['exists' => false]);
        }

        // Sécurité : un compte avec un email déjà enregistré ne peut recevoir son code QUE sur
        // cet email, jamais sur celui saisi dans le formulaire — sinon n'importe qui connaissant
        // le numéro de téléphone d'un client (peu secret : donné au comptoir, sur un ticket...)
        // pourrait prendre le contrôle de son compte en indiquant sa propre adresse ici. Un compte
        // sans email connu (ancien client créé côté POS avant cette fonctionnalité) peut encore en
        // enregistrer un pour la première fois.
        if ($existingClient?->email && strcasecmp($existingClient->email, $data['email']) !== 0) {
            throw ValidationException::withMessages([
                'email' => ['Cet email ne correspond pas au compte associé à ce numéro.'],
            ]);
        }

        // Anti-spam simple : un seul code toutes les 60s pour ce numéro, pas de service de
        // limitation dédié pour une route à si faible volume attendu.
        $recentlySent = ClientLoginCode::query()
            ->where('phone', $data['phone'])
            ->where('created_at', '>', now()->subSeconds(60))
            ->exists();

        if ($recentlySent) {
            throw ValidationException::withMessages([
                'phone' => ['Merci de patienter avant de redemander un code.'],
            ]);
        }

        $code = (string) random_int(100000, 999999);

        ClientLoginCode::query()->create([
            'phone' => $data['phone'],
            'email' => $data['email'],
            'firstname' => $data['firstname'] ?? null,
            'lastname' => $data['lastname'] ?? null,
            'code' => $code,
            'expires_at' => now()->addMinutes(10),
        ]);

        Mail::to($data['email'])->send(new ClientLoginCodeMail($code));

        return response()->json(['sent' => true]);
    }

    /**
     * Étape 2 — vérifie le code reçu par email, le consomme (usage unique), puis crée le Client
     * s'il n'existait pas encore (avec le prénom/nom mémorisés à l'étape 1) ou enregistre son
     * email si le compte n'en avait pas encore (voir requestCode : au-delà de ce cas initial,
     * l'email d'un compte existant ne peut plus être changé depuis cet écran — seul le garde-fou
     * de requestCode empêche qu'il soit détourné, jamais réécrit ici).
     */
    public function verifyCode(Request $request)
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:50'],
            'email' => ['required', 'email', 'max:255'],
            'code' => ['required', 'string'],
        ]);

        $record = ClientLoginCode::query()
            ->where('phone', $data['phone'])
            ->where('email', $data['email'])
            ->where('code', $data['code'])
            ->whereNull('consumed_at')
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();

        if (!$record) {
            throw ValidationException::withMessages([
                'code' => ['Code invalide ou expiré.'],
            ]);
        }

        $record->update(['consumed_at' => now()]);

        $client = Client::query()->where('phone', $data['phone'])->first();

        if (!$client) {
            $client = Client::query()->create([
                'firstname' => $record->firstname,
                'lastname' => $record->lastname,
                'email' => $data['email'],
                'phone' => $data['phone'],
            ]);
        } elseif (!$client->email) {
            $client->update(['email' => $data['email']]);
        }

        return response()->json([
            'id' => $client->id,
            'firstname' => $client->firstname,
            'lastname' => $client->lastname,
            'email' => $client->email,
            'phone' => $client->phone,
            'points_balance' => $client->points_balance ?? 0,
        ]);
    }

    /**
     * Retrouve un client déjà connecté sur cet appareil sans redemander de code — voir
     * CustomerSessionService::refresh() côté front, appelé après un achat pour rafraîchir le solde
     * de points affiché dans la topbar. Ne crée jamais de compte (voir requestCode/verifyCode pour
     * la connexion initiale) : si le client a disparu entre-temps, renvoie juste `{exists: false}`.
     */
    public function login(Request $request)
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:50'],
        ]);

        $client = Client::query()->where('phone', $data['phone'])->first();

        if (!$client) {
            return response()->json(['exists' => false]);
        }

        return response()->json([
            'id' => $client->id,
            'firstname' => $client->firstname,
            'lastname' => $client->lastname,
            'email' => $client->email,
            'phone' => $client->phone,
            // Eloquent ne relit pas le défaut MySQL (0) après un create() — jamais null en
            // pratique une fois écrit en base, juste sur l'instance fraîchement créée.
            'points_balance' => $client->points_balance ?? 0,
        ]);
    }

    /**
     * Historique basé sur les Tickets (encaissements permanents), pas les Orders (supprimées une
     * fois servies/livrées, voir OrderSectionController::envoyer et
     * OrderController::updateDeliveryStatus) — un Ticket reste la seule trace durable d'une vente.
     */
    public function orders(Request $request)
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:50'],
        ]);

        $client = Client::query()->where('phone', $data['phone'])->first();

        if (!$client) {
            return response()->json([]);
        }

        return Ticket::query()
            ->where('client_id', $client->id)
            ->where('source', 'public_shop')
            ->with(['sections.lines.product'])
            ->latest('paid_at')
            ->get();
    }
}
