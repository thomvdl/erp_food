<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\ClientOtpCodeMail;
use App\Models\Client;
use App\Models\ClientOtpCode;
use App\Models\Ticket;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Socialite\Facades\Socialite;

/**
 * Compte client de la boutique en ligne (erp_public_shop), désormais obligatoire pour commander
 * (voir erp_public_shop/src/app/core/auth.guard.ts) — trois méthodes au choix : email + mot de
 * passe (register/authenticate), code à 6 chiffres par email (requestOtp/verifyOtp — ne collecte
 * plus de téléphone contrairement à l'ancienne version de ce système), ou Google
 * (redirectToGoogle/handleGoogleCallback/exchangeGoogleToken). Le mot de passe seul ne prouve PAS
 * la possession de l'email, contrairement au code par email ou à Google — voir register() pour la
 * conséquence assumée (s'inscrire avec l'email d'un Client existant sans mot de passe "récupère"
 * ce compte). Toute action sensible (historique, points, adresses) reroute systématiquement PAR LE
 * NUMÉRO OU L'EMAIL (voir login/orders), jamais par un `client_id` brut envoyé par le front — un
 * compte créé via Google, mot de passe ou OTP n'a généralement pas de téléphone, d'où l'email
 * comme deuxième clé possible, tout aussi peu énumérable en masse qu'un numéro.
 */
class ShopCustomerController extends Controller
{
    /**
     * Inscription par email + mot de passe. `phone` est optionnel — jamais écrasé par un champ
     * laissé vide (voir plus bas) pour ne pas effacer un téléphone déjà connu (compte POS). Si un
     * `Client` existe déjà pour cet email :
     * - avec un mot de passe déjà défini -> refusé (email déjà utilisé).
     * - sans mot de passe (créé au POS par le personnel, ou compte OTP/Google existant) -> ce
     *   compte est "récupéré" : firstname/lastname/password sont mis à jour dessus, plutôt que de
     *   créer un doublon. Voir docblock de la classe pour l'arbitrage assumé.
     * Sinon, crée un nouveau `Client`.
     */
    public function register(Request $request)
    {
        $data = $request->validate([
            'firstname' => ['required', 'string', 'max:255'],
            'lastname' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:8'],
            'phone' => ['nullable', 'string', 'max:50'],
        ]);

        $client = Client::query()->where('email', $data['email'])->first();

        if ($client?->password) {
            throw ValidationException::withMessages([
                'email' => ['Cet email est déjà utilisé.'],
            ]);
        }

        if ($client) {
            $client->update([
                'firstname' => $data['firstname'],
                'lastname' => $data['lastname'],
                'password' => $data['password'],
                ...(!empty($data['phone']) ? ['phone' => $data['phone']] : []),
            ]);
        } else {
            $client = Client::query()->create([
                'firstname' => $data['firstname'],
                'lastname' => $data['lastname'],
                'email' => $data['email'],
                'password' => $data['password'],
                'phone' => $data['phone'] ?? null,
            ]);
        }

        return response()->json($this->clientPayload($client), 201);
    }

    /**
     * Étape 1 de la connexion par code email — envoie un code à 6 chiffres (voir
     * ClientOtpCodeMail), valable 10 minutes. Email inconnu sans nom -> `{exists: false}` (le
     * front redemande prénom/nom avant de rappeler avec, nécessaires pour créer le Client). Email
     * inconnu avec nom -> code envoyé, le nom est mémorisé sur `client_otp_codes` en attendant la
     * vérification (jamais de Client créé avant que le code soit prouvé, même principe que
     * register()).
     */
    public function requestOtp(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'firstname' => ['nullable', 'string', 'max:255'],
            'lastname' => ['nullable', 'string', 'max:255'],
        ]);

        $existingClient = Client::query()->where('email', $data['email'])->first();

        if (!$existingClient && (empty($data['firstname']) || empty($data['lastname']))) {
            return response()->json(['exists' => false]);
        }

        // Anti-spam simple : un seul code toutes les 60s pour cet email, pas de service de
        // limitation dédié pour une route à si faible volume attendu.
        $recentlySent = ClientOtpCode::query()
            ->where('email', $data['email'])
            ->where('created_at', '>', now()->subSeconds(60))
            ->exists();

        if ($recentlySent) {
            throw ValidationException::withMessages([
                'email' => ['Merci de patienter avant de redemander un code.'],
            ]);
        }

        $code = (string) random_int(100000, 999999);

        ClientOtpCode::query()->create([
            'email' => $data['email'],
            'client_id' => $existingClient?->id,
            'firstname' => $data['firstname'] ?? null,
            'lastname' => $data['lastname'] ?? null,
            'code' => $code,
            'expires_at' => now()->addMinutes(10),
        ]);

        Mail::to($data['email'])->send(new ClientOtpCodeMail($code));

        return response()->json(['sent' => true]);
    }

    /**
     * Étape 2 — vérifie le code reçu par email, le consomme (usage unique), puis crée le Client
     * s'il n'existait pas encore (avec le prénom/nom mémorisés à l'étape 1).
     */
    public function verifyOtp(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'code' => ['required', 'string'],
        ]);

        $record = ClientOtpCode::query()
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

        $client = Client::query()->where('email', $data['email'])->first();

        if (!$client) {
            $client = Client::query()->create([
                'firstname' => $record->firstname,
                'lastname' => $record->lastname,
                'email' => $data['email'],
            ]);
        }

        return response()->json($this->clientPayload($client));
    }

    /**
     * Connexion par email + mot de passe — voir App\Http\Controllers\Api\AuthController (staff)
     * pour le même pattern (`Hash::check`, message générique volontairement peu précis).
     */
    public function authenticate(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string'],
        ]);

        $client = Client::query()->where('email', $data['email'])->first();

        if (!$client || !$client->password || !Hash::check($data['password'], $client->password)) {
            throw ValidationException::withMessages([
                'email' => ['Identifiants invalides.'],
            ]);
        }

        return response()->json($this->clientPayload($client));
    }

    /**
     * Retrouve un client déjà connecté sur cet appareil sans redemander de code — voir
     * CustomerSessionService::refresh() côté front, appelé après un achat pour rafraîchir le solde
     * de points affiché dans la topbar. Ne crée jamais de compte (voir requestCode/verifyCode pour
     * la connexion initiale) : si le client a disparu entre-temps, renvoie juste `{exists: false}`.
     * Accepte `phone` OU `email` (un compte créé via Google n'a pas de téléphone, voir docblock de
     * la classe) — cherche par téléphone en priorité si les deux sont fournis.
     */
    public function login(Request $request)
    {
        $data = $request->validate([
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
        ]);

        if (empty($data['phone']) && empty($data['email'])) {
            throw ValidationException::withMessages([
                'phone' => ['Téléphone ou email requis.'],
            ]);
        }

        $client = Client::findByPhoneOrEmail($data['phone'] ?? null, $data['email'] ?? null);

        if (!$client) {
            return response()->json(['exists' => false]);
        }

        return response()->json($this->clientPayload($client));
    }

    /**
     * Historique basé sur les Tickets (encaissements permanents), pas les Orders (supprimées une
     * fois servies/livrées, voir OrderSectionController::envoyer et
     * OrderController::updateDeliveryStatus) — un Ticket reste la seule trace durable d'une vente.
     * Accepte `phone` OU `email` — voir login() ci-dessus pour le pourquoi.
     */
    public function orders(Request $request)
    {
        $data = $request->validate([
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
        ]);

        if (empty($data['phone']) && empty($data['email'])) {
            throw ValidationException::withMessages([
                'phone' => ['Téléphone ou email requis.'],
            ]);
        }

        $client = Client::findByPhoneOrEmail($data['phone'] ?? null, $data['email'] ?? null);

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

    /**
     * Point d'entrée : redirige le navigateur vers l'écran de consentement Google (voir
     * config/services.php pour client_id/redirect). `stateless()` car les routes API n'ont pas de
     * session — le state CSRF habituel de Socialite (stocké en session) ne peut pas être utilisé
     * ici, remplacé par le token à usage unique généré dans handleGoogleCallback().
     */
    public function redirectToGoogle()
    {
        return Socialite::driver('google')->stateless()->redirect();
    }

    /**
     * Retour de Google après consentement. Retrouve/crée le Client (par google_id, puis par email
     * pour lier un compte existant, sinon création), puis redirige vers erp_public_shop avec un
     * token à usage unique (voir exchangeGoogleToken) plutôt que le client_id en clair — un id
     * brut dans l'URL serait trivialement énumérable une fois exposé dans l'historique du
     * navigateur, contrairement au numéro/email utilisés ailleurs dans ce contrôleur.
     */
    public function handleGoogleCallback()
    {
        $shopUrl = rtrim(config('app.shop_url'), '/');

        try {
            $googleUser = Socialite::driver('google')->stateless()->user();
        } catch (\Throwable) {
            return redirect("{$shopUrl}/auth/google/callback?error=1");
        }

        $client = Client::query()->where('google_id', $googleUser->getId())->first();

        if (!$client && $googleUser->getEmail()) {
            $client = Client::query()->where('email', $googleUser->getEmail())->first();
            $client?->update(['google_id' => $googleUser->getId()]);
        }

        if (!$client) {
            $firstname = $googleUser->user['given_name'] ?? null;
            $lastname = $googleUser->user['family_name'] ?? null;

            // Repli si le compte Google ne renvoie pas given_name/family_name séparément (rare) —
            // Client::firstname/lastname ne sont pas nullable en base.
            if (!$firstname && !$lastname) {
                $parts = preg_split('/\s+/', trim((string) $googleUser->getName()), 2);
                $firstname = $parts[0] ?? '';
                $lastname = $parts[1] ?? '';
            }

            $client = Client::query()->create([
                'firstname' => $firstname ?: 'Client',
                'lastname' => $lastname ?: '',
                'email' => $googleUser->getEmail(),
                'google_id' => $googleUser->getId(),
            ]);
        }

        $token = Str::random(40);

        Cache::put("shop_google_login:{$token}", $this->clientPayload($client), now()->addSeconds(60));

        return redirect("{$shopUrl}/auth/google/callback?token={$token}");
    }

    /**
     * Échange le token à usage unique de handleGoogleCallback() contre les infos du client — voir
     * CustomerSessionService::completeGoogleLogin() côté front, appelé juste après la redirection
     * de retour. `Cache::pull` lit et supprime atomiquement (usage unique, comme le code par
     * email), expire de toute façon après 60s (voir handleGoogleCallback).
     */
    public function exchangeGoogleToken(Request $request)
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
        ]);

        $customer = Cache::pull("shop_google_login:{$data['token']}");

        if (!$customer) {
            throw ValidationException::withMessages([
                'token' => ['Lien de connexion expiré, merci de réessayer.'],
            ]);
        }

        return response()->json($customer);
    }

    /** Forme commune renvoyée par register/authenticate/login/handleGoogleCallback. */
    private function clientPayload(Client $client): array
    {
        return [
            'id' => $client->id,
            'firstname' => $client->firstname,
            'lastname' => $client->lastname,
            'email' => $client->email,
            'phone' => $client->phone,
            // Eloquent ne relit pas le défaut MySQL (0) après un create() — jamais null en
            // pratique une fois écrit en base, juste sur l'instance fraîchement créée.
            'points_balance' => $client->points_balance ?? 0,
        ];
    }
}
