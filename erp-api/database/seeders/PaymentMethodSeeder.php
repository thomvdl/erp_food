<?php

namespace Database\Seeders;

use App\Models\PaymentMethod;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class PaymentMethodSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        // "QR Code" : paiement Stripe/Bancontact réel du variant QR kiosque (voir
        // StripeWebhookController::markPaid) — distinct de "Bancontact" pour pouvoir
        // reconnaître/réconcilier séparément les deux variants de paiement kiosque, même si les
        // deux passent par Bancontact au sens du réseau bancaire (voir docblock de KioskOrder,
        // erp_kiosk).
        $methods = ['Espèces', 'Bancontact', 'Chèque-repas', 'QR Code'];

        foreach ($methods as $name) {
            PaymentMethod::query()->firstOrCreate(['slug' => Str::slug($name)], ['name' => $name]);
        }
    }
}
