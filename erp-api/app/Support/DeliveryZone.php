<?php

namespace App\Support;

use App\Models\Param;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

/**
 * Géocodage + vérification de rayon de livraison pour la boutique en ligne (erp_public_shop) —
 * utilisé à la fois par ShopDeliveryZoneController (vérification "à chaud" depuis la topbar,
 * avant même de composer le panier) et par ShopCheckoutController::store (revérification côté
 * serveur, jamais confiance au résultat déjà affiché côté client). Géocodage via
 * OpenStreetMap/Nominatim (gratuit, pas de clé API à gérer) — moins précis que Google Maps sur
 * des adresses ambiguës, mais suffisant pour juste calculer une distance à vol d'oiseau.
 */
class DeliveryZone
{
    /**
     * @return array{lat: float, lng: float, formatted_address: string, distance_km: float, within_radius: bool}
     */
    public static function checkAddress(string $address): array
    {
        $result = self::geocode($address);

        if (!$result) {
            throw ValidationException::withMessages([
                'delivery_address' => ["Adresse introuvable — vérifiez l'orthographe."],
            ]);
        }

        // Adresse de référence de l'établissement — voir Paramètres > Réglages ("shop_address").
        // Tant qu'elle n'est pas renseignée, aucune restriction n'est appliquée plutôt que de
        // bloquer silencieusement toutes les livraisons : mieux vaut un rayon pas encore actif
        // qu'une boutique qui refuse tout sans explication.
        $shopAddress = Param::query()->where('name', 'shop_address')->value('value');

        if (!$shopAddress) {
            return [
                'lat' => $result['lat'],
                'lng' => $result['lng'],
                'formatted_address' => $result['formatted_address'],
                'distance_km' => 0.0,
                'within_radius' => true,
            ];
        }

        // Géocodée une fois puis mise en cache (l'adresse de l'établissement change rarement,
        // inutile de la regéocoder à chaque vérification client — contrairement à l'adresse du
        // client ci-dessus, toujours fraîche) : évite de solliciter Nominatim pour rien et reste
        // dans les clous de sa politique d'usage (pas d'appels répétés pour la même requête).
        $shopCoordinates = Cache::remember(
            'shop_address_coordinates:' . md5($shopAddress),
            now()->addDay(),
            fn () => self::geocode($shopAddress),
        );

        if (!$shopCoordinates) {
            // Adresse de référence renseignée mais introuvable par Nominatim — même comportement
            // que non renseignée : ne bloque pas les livraisons pour une erreur de configuration.
            return [
                'lat' => $result['lat'],
                'lng' => $result['lng'],
                'formatted_address' => $result['formatted_address'],
                'distance_km' => 0.0,
                'within_radius' => true,
            ];
        }

        $radiusKm = (float) (Param::query()->where('name', 'shop_delivery_radius_km')->value('value') ?? 10);
        $distanceKm = self::haversineKm($shopCoordinates['lat'], $shopCoordinates['lng'], $result['lat'], $result['lng']);

        return [
            'lat' => $result['lat'],
            'lng' => $result['lng'],
            'formatted_address' => $result['formatted_address'],
            'distance_km' => round($distanceKm, 1),
            'within_radius' => $distanceKm <= $radiusKm,
        ];
    }

    /** @return ?array{lat: float, lng: float, formatted_address: string} */
    private static function geocode(string $address): ?array
    {
        // User-Agent explicite : exigé par la politique d'usage de Nominatim (voir
        // https://operations.osmfoundation.org/policies/nominatim/), un client HTTP par défaut
        // sans identification s'expose à un blocage.
        $response = Http::withHeaders([
            'User-Agent' => config('app.name') . ' (' . (config('mail.from.address') ?: 'contact@example.com') . ')',
        ])->get('https://nominatim.openstreetmap.org/search', [
            'q' => $address,
            'format' => 'json',
            'limit' => 1,
        ]);

        $results = $response->successful() ? $response->json() : [];

        if (empty($results)) {
            return null;
        }

        return [
            'lat' => (float) $results[0]['lat'],
            'lng' => (float) $results[0]['lon'],
            'formatted_address' => $results[0]['display_name'],
        ];
    }

    private static function haversineKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthRadiusKm = 6371;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return $earthRadiusKm * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }
}
