<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Diffusé par StripeWebhookController une fois qu'un KioskCheckout (paiement QR/Bancontact) est
 * confirmé et le Ticket matérialisé (voir App\Support\KioskSaleRecorder). Canal public scopé par
 * checkout — un seul kiosque écoute jamais ce canal précis à la fois (voir
 * kiosk-payment-echo.service.ts), donc pas besoin d'auth de canal, même principe que le canal
 * public "kitchen" (voir OrderKitchenUpdated). Payload minimal (juste l'id, comme
 * OrderKitchenUpdated) : le kiosque réutilise GET /kiosk-checkouts/{id} (KioskCheckoutController::show)
 * pour charger le Ticket — même endpoint que le polling de secours, un seul code chemin côté front.
 */
class KioskCheckoutPaid implements ShouldBroadcastNow
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
        return 'checkout.paid';
    }
}
