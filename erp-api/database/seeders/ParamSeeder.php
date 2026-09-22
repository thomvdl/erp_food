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
            // Barre de filtre Postes/Passes du kitchen display (voir
            // KitchenDisplayController::config) — true par défaut : comportement historique
            // inchangé, un poste dédié qui doit rester verrouillé sur son poste/passe (choisi à
            // la connexion, voir erp_kitchen_display/poste-select.ts) se désactive explicitement.
            'kitchen_display_show_filter_bar' => 'true',
            // Petits établissements sans passe dédié (voir OrderSectionController::marquerFait) —
            // false par défaut : comportement historique inchangé (poste puis passe). À 'true',
            // "marquer prête" depuis un poste envoie directement (saute l'étape passe), et la
            // barre de filtre + l'écran poste-select n'affichent plus la colonne "Passes".
            'kitchen_display_skip_passe' => 'false',
            // Boutique en ligne (voir ShopCheckoutController::store et App\Support\DeliveryZone).
            'shop_delivery_fee' => '5.00',
            'shop_delivery_radius_km' => '5',
            'shop_address' => 'Rue de Plainevaux 96, 4100 Seraing, Belgique',
            // Horaires ET jours d'ouverture de la boutique en ligne (voir
            // App\Support\ShopOpeningHours) — le site reste consultable hors de ces horaires
            // (contrairement au self-order ci-dessus), seule la commande est bloquée.
            // shop_open_days : CSV parmi mon,tue,wed,thu,fri,sat,sun — tous présents par défaut
            // (aucune restriction de jour), retirer un jour pour fermer ce jour-là (ex. dimanche).
            'shop_open_at' => '10:00',
            'shop_close_at' => '22:00',
            'shop_open_days' => 'mon,tue,wed,thu,fri,sat,sun',
            // Active/désactive entièrement l'option "Livraison" de la boutique en ligne (voir
            // ShopCatalogController::index/ShopCheckoutController::store) — true par défaut,
            // comportement historique inchangé. Passer à 'false' masque l'option de retrait
            // "Livraison" et le badge adresse de livraison, et rejette (422) toute tentative
            // malgré tout envoyée directement à l'API.
            'shop_delivery_available' => 'true',
        ];

        foreach ($params as $name => $value) {
            Param::query()->firstOrCreate(['name' => $name], ['value' => $value]);
        }
    }
}
