<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Diffusé par StripeWebhookController une fois qu'un ShopCheckout (boutique en ligne) est
 * confirmé et le Ticket matérialisé (voir App\Support\ShopSaleRecorder) — mirror direct de
 * KioskCheckoutPaid. Canal public scopé par checkout (un seul navigateur écoute jamais ce canal
 * précis à la fois), payload minimal : la page de confirmation réutilise
 * GET /shop/checkouts/{id} (ShopCheckoutController::show) pour charger le récap.
 */
class ShopCheckoutPaid implements ShouldBroadcastNow
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
        return 'checkout.paid';
    }
}
