<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Support\DeliveryZone;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Adresses enregistrées par un client de la boutique en ligne (erp_public_shop, voir dashboard
 * "Mon compte") — réutilisées pour pré-remplir l'adresse de livraison au checkout (voir
 * pages/checkout/checkout.ts), qui la revalide de toute façon (ShopCheckoutController::store).
 * Même modèle de confiance que ShopCustomerController : identification par `phone`/`email` envoyés
 * dans le corps de chaque requête (voir Client::findByPhoneOrEmail), jamais par un `client_id`
 * brut — chaque action est scopée via `$client->addresses()`, une adresse d'un autre client 404
 * naturellement plutôt que de révéler son existence.
 */
class ShopCustomerAddressController extends Controller
{
    public function index(Request $request)
    {
        $data = $this->validateIdentity($request);
        $client = Client::findByPhoneOrEmail($data['phone'] ?? null, $data['email'] ?? null);

        return response()->json($client?->addresses ?? []);
    }

    /**
     * `address` est toujours normalisée via DeliveryZone::checkAddress (Nominatim) avant
     * d'être enregistrée — jamais le texte brut saisi (même règle que
     * ShopCheckoutController::store). La première adresse d'un client devient son défaut
     * automatiquement, quoi que le front ait envoyé : un compte ne doit jamais se retrouver sans
     * aucune adresse par défaut une fois qu'il en a au moins une.
     */
    public function store(Request $request)
    {
        $data = $this->validateIdentity($request, [
            'label' => ['nullable', 'string', 'max:255'],
            'address' => ['required', 'string', 'max:500'],
            'is_default' => ['nullable', 'boolean'],
        ]);

        $client = Client::findByPhoneOrEmail($data['phone'] ?? null, $data['email'] ?? null);

        if (!$client) {
            throw ValidationException::withMessages([
                'phone' => ['Compte introuvable.'],
            ]);
        }

        $formattedAddress = DeliveryZone::checkAddress($data['address'])['formatted_address'];
        $isFirstAddress = $client->addresses()->doesntExist();

        $address = DB::transaction(function () use ($client, $data, $formattedAddress, $isFirstAddress) {
            $address = $client->addresses()->create([
                'label' => $data['label'] ?? null,
                'address' => $formattedAddress,
                'is_default' => $isFirstAddress || ($data['is_default'] ?? false),
            ]);

            if ($address->is_default) {
                $client->addresses()->where('id', '!=', $address->id)->update(['is_default' => false]);
            }

            return $address;
        });

        return response()->json($address, 201);
    }

    public function update(Request $request, int $id)
    {
        $data = $this->validateIdentity($request, [
            'label' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:500'],
        ]);

        $address = $this->resolveOwnedAddress($request, $data, $id);

        if (array_key_exists('label', $data)) {
            $address->label = $data['label'];
        }
        if (!empty($data['address'])) {
            $address->address = DeliveryZone::checkAddress($data['address'])['formatted_address'];
        }
        $address->save();

        return response()->json($address);
    }

    public function setDefault(Request $request, int $id)
    {
        $data = $this->validateIdentity($request);
        $address = $this->resolveOwnedAddress($request, $data, $id);

        DB::transaction(function () use ($address) {
            $address->client->addresses()->where('id', '!=', $address->id)->update(['is_default' => false]);
            $address->update(['is_default' => true]);
        });

        return response()->json($address->fresh());
    }

    /**
     * Pas de promotion automatique d'une autre adresse en défaut si celle supprimée l'était — le
     * client en choisit une autre lui-même (voir setDefault), pas de règle implicite de plus.
     */
    public function destroy(Request $request, int $id)
    {
        $data = $this->validateIdentity($request);
        $address = $this->resolveOwnedAddress($request, $data, $id);
        $address->delete();

        return response()->json(['deleted' => true]);
    }

    private function validateIdentity(Request $request, array $extraRules = []): array
    {
        $data = $request->validate([
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            ...$extraRules,
        ]);

        if (empty($data['phone']) && empty($data['email'])) {
            throw ValidationException::withMessages([
                'phone' => ['Téléphone ou email requis.'],
            ]);
        }

        return $data;
    }

    private function resolveOwnedAddress(Request $request, array $data, int $id)
    {
        $client = Client::findByPhoneOrEmail($data['phone'] ?? null, $data['email'] ?? null);

        abort_if(!$client, 404);

        return $client->addresses()->findOrFail($id);
    }
}
