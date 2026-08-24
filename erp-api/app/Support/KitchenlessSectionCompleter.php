<?php

namespace App\Support;

use App\Events\OrderKitchenUpdated;
use App\Models\OrderSection;

/**
 * Une section dont AUCUNE ligne n'a de station (voir Product.station_id) ne passe jamais par le
 * kitchen display (voir erp_kitchen_display > kitchen-board.ts, qui les exclut entièrement de
 * TOUTES ses vues) — donc jamais par OrderSectionController::marquerFait/envoyer non plus, seul
 * déclencheur de la complétion 'ask' -> 'do' -> 'seed' pour les commandes sans staff dédié
 * (kiosque, self-order, boutique en ligne). Sans ce court-circuit, une telle section (ex. une
 * simple boisson sans plat à préparer) resterait bloquée à 'ask' pour toujours, et sa commande ne
 * serait jamais nettoyée. Appelé juste après la création de la section par
 * ShopSaleRecorder/KioskSaleRecorder/SelfOrderController — jamais par le POS Restaurant (dine-in),
 * dont les Order ne se suppriment qu'au paiement (voir OrderController::pay), pas à la complétion
 * cuisine, donc pas concerné par ce blocage.
 */
class KitchenlessSectionCompleter
{
    public static function maybeAutoComplete(OrderSection $section): void
    {
        $section->load('lines.product');

        $hasKitchenLine = $section->lines->contains(fn ($line) => $line->product?->station_id !== null);
        if ($hasKitchenLine) {
            return;
        }

        foreach ($section->lines as $line) {
            $line->forceFill(['done' => true, 'sent' => true])->save();
        }
        $section->update(['state' => 'seed']);

        $order = $section->order;
        $allSent = $order->sections()->where('state', '!=', 'seed')->doesntExist();
        if (!$allSent) {
            return;
        }

        $order->update(['state' => 'seed']);

        // Même règle que OrderSectionController::envoyer : une commande sans table déjà payée
        // (kiosque/self-order/boutique en ligne "à emporter") n'a plus lieu d'exister une fois
        // entièrement prête — ici, "prête" instantanément puisqu'il n'y a rien à cuisiner. Une
        // livraison, elle, reste vivante jusqu'à OrderController::updateDeliveryStatus.
        if ($order->table_id === null && $order->fulfillment_type !== 'delivery') {
            $orderId = $order->id;
            $order->delete();
            event(new OrderKitchenUpdated($orderId));

            return;
        }

        event(new OrderKitchenUpdated($order->id));
    }
}
