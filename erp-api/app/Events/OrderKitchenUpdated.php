<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Diffusé à chaque mutation d'une Order — canal public "kitchen" (pas de scope par utilisateur,
 * la cuisine et le POS - Restaurant partagent la même vue). Deux familles d'abonnés distinctes :
 *   - erp_kitchen_display (kitchen-board.ts) : ne s'intéresse qu'aux transitions d'état pertinentes
 *     pour la cuisine (section demandée/faite/envoyée) — reçoit aussi les événements non pertinents
 *     (table ouverte, produit ajouté à une section encore 'en_attente') mais s'en accommode déjà
 *     puisqu'il ne fait qu'un refetch générique de la liste, sans lire le payload.
 *   - erp-app POS - Restaurant (table-select.ts, order-builder.ts) : "synchroniser les différentes
 *     instances de POS - Restaurant quand une table est ouverte ou payée, à chaque modification de
 *     table/paiement/ajout de produit" (voir Readme.md) — donc diffusé pour TOUTE mutation d'Order
 *     (ouverture de table, section créée/supprimée, ligne ajoutée/modifiée/supprimée, section
 *     validée/demandée/faite/envoyée, commande payée/annulée), pas seulement les transitions
 *     cuisine.
 * ShouldBroadcastNow (pas ShouldBroadcast) : pas de worker de queue actif dans ce projet
 * (QUEUE_CONNECTION=database sans process `queue:work` dédié), la diffusion doit donc être
 * synchrone. Payload minimal (juste l'id) : les clients rechargent la commande/liste complète,
 * cohérent avec le reste de l'app (order-builder ne garde jamais d'état local dérivé, toujours un
 * refetch après mutation).
 */
class OrderKitchenUpdated implements ShouldBroadcastNow
{
    use Dispatchable;

    public function __construct(public int $orderId)
    {
    }

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new Channel('kitchen')];
    }

    public function broadcastAs(): string
    {
        return 'order.updated';
    }
}
