<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Diffusé par StripeWebhookController quand un paiement boutique en ligne échoue ou qu'une
 * session Stripe expire sans être payée — mirror direct de KioskCheckoutFailed, permet à la page
 * de confirmation de sortir de l'attente sans attendre le polling de secours.
 */
class ShopCheckoutFailed implements ShouldBroadcastNow
{
    use Dispatchable;

    public function __construct(public int $shopCheckoutId)
    {
    }

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new Channel("shop-checkout.{$this->shopCheckoutId}")];
    }

    public function broadcastAs(): string
    {
        return 'checkout.failed';
    }
}
