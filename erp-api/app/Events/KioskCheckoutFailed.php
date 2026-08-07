<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Diffusé par StripeWebhookController quand un paiement QR/Bancontact échoue ou qu'une session
 * Stripe expire sans être payée — permet au kiosque de sortir de l'attente sans attendre le
 * polling de secours (voir docblock de KioskCheckoutPaid, même canal/principe).
 */
class KioskCheckoutFailed implements ShouldBroadcastNow
{
    use Dispatchable;

    public function __construct(public int $kioskCheckoutId)
    {
    }

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new Channel("kiosk-checkout.{$this->kioskCheckoutId}")];
    }

    public function broadcastAs(): string
    {
        return 'checkout.failed';
    }
}
