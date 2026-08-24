<?php

namespace Database\Seeders;

use App\Models\Param;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

/**
 * Réglages génériques clé/valeur (Paramètres > Réglages, voir Param::class) — firstOrCreate comme
 * PaymentMethodSeeder : ne touche jamais une valeur déjà modifiée depuis l'écran Réglages, se
 * contente de garantir qu'une installation neuve démarre avec des valeurs sensées plutôt qu'un
 * self-order "toujours fermé" ou une boutique en ligne sans rayon de livraison configuré.
 */
class ParamSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $params = [
            // Horaires d'ouverture du self-order (voir App\Support\OpeningHours) — absent des
            // deux = pas de restriction, ici volontairement configuré dès le départ.
            'self_order_open_at' => '10:00',
            'self_order_close_at' => '22:00',
            // Écran "sur place / à emporter" du kiosque (voir KioskOrderController::config).
            'kiosk_table_available' => 'true',
            // Boutique en ligne (voir ShopCheckoutController::store et App\Support\DeliveryZone).
            'shop_delivery_fee' => '5.00',
            'shop_delivery_radius_km' => '5',
            'shop_address' => 'Rue de Plainevaux 96, 4100 Seraing, Belgique',
        ];

        foreach ($params as $name => $value) {
            Param::query()->firstOrCreate(['name' => $name], ['value' => $value]);
        }
    }
}
