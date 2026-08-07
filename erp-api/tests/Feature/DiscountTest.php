<?php

namespace Tests\Feature;

use App\Models\CashSession;
use App\Models\Client;
use App\Models\Discount;
use App\Models\Order;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\ProductCatalog;
use App\Models\Room;
use App\Models\TableElement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Codes de réduction (voir App\Support\DiscountCalculator) — trois types (percentage,
 * fixed_amount, free_product), un seuil d'éligibilité optionnel (minimum_total : montant
 * d'achat minimum requis, PAS un plafond — une fois atteint la réduction s'applique en entier),
 * et l'intégration dans les 3 endroits où un paiement est réellement encaissé (TicketController,
 * OrderController::pay, KioskOrderController).
 */
class DiscountTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private PaymentMethod $cash;
    private Product $product;
    private CashSession $cashSession;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = $this->actingAsAdmin();

        $this->cash = PaymentMethod::query()->create(['name' => 'Espèces', 'slug' => 'especes']);
        $this->product = Product::query()->create(['name' => 'Café', 'slug' => 'cafe', 'price' => 3]);

        $this->cashSession = CashSession::query()->create([
            'user_id' => $this->user->id,
            'opening_amount' => 100,
            'opened_at' => now(),
        ]);
    }

    // --- CRUD (Paramètres > Réductions) ---

    public function test_create_percentage_discount(): void
    {
        $response = $this->postJson('/api/discounts', [
            'code' => 'promo10',
            'type' => 'percentage',
            'value' => 10,
            'starts_at' => '2026-01-01',
            'ends_at' => '2026-12-31',
        ]);

        $response->assertCreated()->assertJsonPath('code', 'promo10');
        $this->assertDatabaseHas('discounts', ['code' => 'promo10', 'type' => 'percentage']);
    }

    public function test_create_fixed_amount_discount(): void
    {
        $this->postJson('/api/discounts', [
            'code' => 'B10',
            'type' => 'fixed_amount',
            'value' => 10,
            'starts_at' => '2026-01-01',
            'ends_at' => '2026-12-31',
        ])->assertCreated();

        $this->assertDatabaseHas('discounts', ['code' => 'B10', 'type' => 'fixed_amount', 'value' => 10]);
    }

    public function test_create_free_product_discount(): void
    {
        $response = $this->postJson('/api/discounts', [
            'code' => 'CAFEOFFERT',
            'type' => 'free_product',
            'free_product_id' => $this->product->id,
            'starts_at' => '2026-01-01',
            'ends_at' => '2026-12-31',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('discounts', ['code' => 'CAFEOFFERT', 'free_product_id' => $this->product->id]);
    }

    public function test_value_is_required_for_percentage_and_fixed_amount(): void
    {
        $this->postJson('/api/discounts', [
            'code' => 'NOVAL',
            'type' => 'percentage',
            'starts_at' => '2026-01-01',
            'ends_at' => '2026-12-31',
        ])->assertStatus(422)->assertJsonValidationErrors('value');
    }

    public function test_percentage_cannot_exceed_100(): void
    {
        $this->postJson('/api/discounts', [
            'code' => 'TOOMUCH',
            'type' => 'percentage',
            'value' => 150,
            'starts_at' => '2026-01-01',
            'ends_at' => '2026-12-31',
        ])->assertStatus(422)->assertJsonValidationErrors('value');
    }

    public function test_free_product_requires_a_product(): void
    {
        $this->postJson('/api/discounts', [
            'code' => 'NOPRODUCT',
            'type' => 'free_product',
            'starts_at' => '2026-01-01',
            'ends_at' => '2026-12-31',
        ])->assertStatus(422)->assertJsonValidationErrors('free_product_id');
    }

    public function test_code_must_be_unique(): void
    {
        Discount::query()->create([
            'code' => 'DUPLICATE', 'type' => 'percentage', 'value' => 5,
            'starts_at' => '2026-01-01', 'ends_at' => '2026-12-31',
        ]);

        $this->postJson('/api/discounts', [
            'code' => 'DUPLICATE',
            'type' => 'percentage',
            'value' => 10,
            'starts_at' => '2026-01-01',
            'ends_at' => '2026-12-31',
        ])->assertStatus(422)->assertJsonValidationErrors('code');
    }

    public function test_ends_at_must_be_after_or_equal_starts_at(): void
    {
        $this->postJson('/api/discounts', [
            'code' => 'BADDATES',
            'type' => 'percentage',
            'value' => 10,
            'starts_at' => '2026-06-01',
            'ends_at' => '2026-01-01',
        ])->assertStatus(422)->assertJsonValidationErrors('ends_at');
    }

    public function test_update_discount_can_reuse_its_own_code(): void
    {
        $discount = Discount::query()->create([
            'code' => 'KEEP', 'type' => 'percentage', 'value' => 5,
            'starts_at' => '2026-01-01', 'ends_at' => '2026-12-31',
        ]);

        $this->putJson("/api/discounts/{$discount->id}", [
            'code' => 'KEEP',
            'type' => 'percentage',
            'value' => 15,
            'starts_at' => '2026-01-01',
            'ends_at' => '2026-12-31',
        ])->assertOk()->assertJsonPath('value', '15.00');
    }

    public function test_list_discounts(): void
    {
        Discount::query()->create(['code' => 'A', 'type' => 'percentage', 'value' => 5, 'starts_at' => '2026-01-01', 'ends_at' => '2026-12-31']);
        Discount::query()->create(['code' => 'B', 'type' => 'percentage', 'value' => 5, 'starts_at' => '2026-01-01', 'ends_at' => '2026-12-31']);

        $this->getJson('/api/discounts')->assertOk()->assertJsonCount(2);
    }

    // --- Aperçu live (POST /discounts/validate) ---

    public function test_validate_endpoint_computes_percentage_amount_off(): void
    {
        Discount::query()->create([
            'code' => 'PROMO10', 'type' => 'percentage', 'value' => 10,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);

        $response = $this->postJson('/api/discounts/validate', [
            'code' => 'PROMO10',
            'lines' => [['product_id' => $this->product->id, 'quantity' => 2]],
        ]);

        // 2 × 3€ = 6€, 10% = 0.60€.
        $response->assertOk()->assertJsonPath('amount_off', 0.6);
    }

    public function test_validate_endpoint_computes_fixed_amount_capped_to_total(): void
    {
        Discount::query()->create([
            'code' => 'BIG5', 'type' => 'fixed_amount', 'value' => 5,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);

        // Total = 3€, réduction fixe de 5€ mais ne peut jamais dépasser le total.
        $response = $this->postJson('/api/discounts/validate', [
            'code' => 'BIG5',
            'lines' => [['product_id' => $this->product->id, 'quantity' => 1]],
        ]);

        $response->assertOk()->assertJsonPath('amount_off', 3);
    }

    public function test_validate_endpoint_free_product_requires_it_in_cart(): void
    {
        $other = Product::query()->create(['name' => 'Thé', 'slug' => 'the', 'price' => 2]);
        Discount::query()->create([
            'code' => 'CAFEOFFERT', 'type' => 'free_product', 'free_product_id' => $this->product->id,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);

        $this->postJson('/api/discounts/validate', [
            'code' => 'CAFEOFFERT',
            'lines' => [['product_id' => $other->id, 'quantity' => 1]],
        ])->assertStatus(422)->assertJsonValidationErrors('discount_code');

        $this->postJson('/api/discounts/validate', [
            'code' => 'CAFEOFFERT',
            'lines' => [['product_id' => $this->product->id, 'quantity' => 1]],
        ])->assertOk()->assertJsonPath('amount_off', 3);
    }

    public function test_validate_endpoint_rejects_unknown_code(): void
    {
        $this->postJson('/api/discounts/validate', [
            'code' => 'NOPE',
            'lines' => [['product_id' => $this->product->id, 'quantity' => 1]],
        ])->assertStatus(422)->assertJsonValidationErrors('discount_code');
    }

    public function test_validate_endpoint_rejects_expired_code(): void
    {
        Discount::query()->create([
            'code' => 'OLD', 'type' => 'percentage', 'value' => 50,
            'starts_at' => now()->subDays(10), 'ends_at' => now()->subDays(5),
        ]);

        $this->postJson('/api/discounts/validate', [
            'code' => 'OLD',
            'lines' => [['product_id' => $this->product->id, 'quantity' => 1]],
        ])->assertStatus(422)->assertJsonValidationErrors('discount_code');
    }

    public function test_validate_endpoint_rejects_inactive_code(): void
    {
        Discount::query()->create([
            'code' => 'DISABLED', 'type' => 'percentage', 'value' => 50, 'active' => false,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);

        $this->postJson('/api/discounts/validate', [
            'code' => 'DISABLED',
            'lines' => [['product_id' => $this->product->id, 'quantity' => 1]],
        ])->assertStatus(422)->assertJsonValidationErrors('discount_code');
    }

    // --- Seuil d'éligibilité (minimum_total) — voir la correction dans DiscountCalculator ---

    public function test_minimum_total_rejects_the_code_below_the_threshold(): void
    {
        Discount::query()->create([
            'code' => 'B10', 'type' => 'fixed_amount', 'value' => 10, 'minimum_total' => 15,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);

        // 1 café = 3€, sous le seuil de 15€.
        $this->postJson('/api/discounts/validate', [
            'code' => 'B10',
            'lines' => [['product_id' => $this->product->id, 'quantity' => 1]],
        ])->assertStatus(422)->assertJsonValidationErrors('discount_code');
    }

    public function test_minimum_total_applies_the_full_amount_once_reached(): void
    {
        Discount::query()->create([
            'code' => 'B10', 'type' => 'fixed_amount', 'value' => 10, 'minimum_total' => 15,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);

        // 6 cafés = 18€, au-dessus du seuil de 15€ — les 10€ complets doivent être déduits,
        // PAS un montant réduit pour "rester au-dessus" du seuil (c'est le bug corrigé : voir
        // DiscountCalculator::amountOff, minimum_total est une éligibilité, pas un plafond).
        $response = $this->postJson('/api/discounts/validate', [
            'code' => 'B10',
            'lines' => [['product_id' => $this->product->id, 'quantity' => 6]],
        ]);

        $response->assertOk()->assertJsonPath('amount_off', 10);
    }

    public function test_minimum_total_applies_full_amount_exactly_at_the_threshold(): void
    {
        Discount::query()->create([
            'code' => 'B10', 'type' => 'fixed_amount', 'value' => 10, 'minimum_total' => 15,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);

        // 5 cafés = 15€, exactement au seuil.
        $response = $this->postJson('/api/discounts/validate', [
            'code' => 'B10',
            'lines' => [['product_id' => $this->product->id, 'quantity' => 5]],
        ]);

        $response->assertOk()->assertJsonPath('amount_off', 10);
    }

    // --- Intégration paiement : POS Vente directe (TicketController::store) ---

    public function test_ticket_store_applies_a_discount(): void
    {
        Discount::query()->create([
            'code' => 'PROMO10', 'type' => 'percentage', 'value' => 10,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);

        // 2 × 3€ = 6€ - 10% = 5.40€.
        $response = $this->postJson('/api/tickets', [
            'client_id' => null,
            'cash_session_id' => $this->cashSession->id,
            'discount_code' => 'PROMO10',
            'lines' => [['product_id' => $this->product->id, 'quantity' => 2]],
            'payments' => [['payment_method_id' => $this->cash->id, 'value' => 5.4]],
        ]);

        $response->assertCreated()->assertJsonPath('discount_amount', '0.60');
        $this->assertDatabaseHas('tickets', ['discount_amount' => 0.6]);
    }

    public function test_ticket_store_rejects_payment_ignoring_the_discount(): void
    {
        Discount::query()->create([
            'code' => 'PROMO10', 'type' => 'percentage', 'value' => 10,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);

        $this->postJson('/api/tickets', [
            'client_id' => null,
            'cash_session_id' => $this->cashSession->id,
            'discount_code' => 'PROMO10',
            'lines' => [['product_id' => $this->product->id, 'quantity' => 2]],
            // Le client a payé le plein tarif (6€) sans tenir compte de la réduction (5.40€ dû).
            'payments' => [['payment_method_id' => $this->cash->id, 'value' => 6]],
        ])->assertStatus(422)->assertJsonValidationErrors('payments');
    }

    public function test_ticket_store_without_discount_code_is_unaffected(): void
    {
        $response = $this->postJson('/api/tickets', [
            'client_id' => null,
            'cash_session_id' => $this->cashSession->id,
            'lines' => [['product_id' => $this->product->id, 'quantity' => 1]],
            'payments' => [['payment_method_id' => $this->cash->id, 'value' => 3]],
        ]);

        $response->assertCreated()->assertJsonPath('discount_amount', null);
    }

    // --- Intégration paiement : POS Restaurant (OrderController::pay) ---

    public function test_order_pay_applies_a_discount(): void
    {
        Discount::query()->create([
            'code' => 'PROMO10', 'type' => 'percentage', 'value' => 10,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);

        $room = Room::query()->create(['name' => 'Salle', 'slug' => 'salle', 'type' => 'restaurant']);
        $table = TableElement::query()->create([
            'type' => 'table', 'label' => 'T1', 'pos_left' => 0, 'pos_top' => 0,
            'width' => 50, 'height' => 50, 'room_id' => $room->id,
        ]);
        $order = Order::query()->create(['table_id' => $table->id, 'number_of_guests' => 2, 'state' => 'send', 'source' => 'pos_restaurant']);
        $section = $order->sections()->create(['name' => 'Section 1', 'state' => 'seed']);
        $section->lines()->create(['product_id' => $this->product->id, 'quantity' => 2]);

        // 2 × 3€ = 6€ - 10% = 5.40€.
        $response = $this->postJson("/api/orders/{$order->id}/pay", [
            'cash_session_id' => $this->cashSession->id,
            'discount_code' => 'PROMO10',
            'payments' => [['payment_method_id' => $this->cash->id, 'value' => 5.4]],
        ]);

        $response->assertCreated()->assertJsonPath('discount_amount', '0.60');
    }

    // --- Intégration paiement : Kiosk (KioskOrderController::store) ---

    public function test_kiosk_order_applies_a_discount(): void
    {
        Discount::query()->create([
            'code' => 'PROMO10', 'type' => 'percentage', 'value' => 10,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);

        // active_kiosk est volontairement absent du Fillable (voir ProductCatalog) — doit
        // passer par forceFill, comme ProductCatalogController::activateForKiosk.
        $catalog = ProductCatalog::query()->create(['name' => 'Kiosk', 'slug' => 'kiosk', 'active' => true]);
        $catalog->forceFill(['active_kiosk' => true])->save();
        $catalog->products()->attach($this->product->id);

        // 2 × 3€ = 6€ - 10% = 5.40€.
        $response = $this->postJson('/api/kiosk-orders', [
            'client_id' => null,
            'cash_session_id' => $this->cashSession->id,
            'discount_code' => 'PROMO10',
            'lines' => [['product_id' => $this->product->id, 'quantity' => 2]],
            'payments' => [['payment_method_id' => $this->cash->id, 'value' => 5.4]],
        ]);

        $response->assertCreated()->assertJsonPath('discount_amount', '0.60');
    }

    // --- Réductions client-facing : le produit offert doit être dans la commande ---

    public function test_free_product_discount_deducts_its_own_price(): void
    {
        Discount::query()->create([
            'code' => 'CAFEOFFERT', 'type' => 'free_product', 'free_product_id' => $this->product->id,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);

        $croissant = Product::query()->create(['name' => 'Croissant', 'slug' => 'croissant', 'price' => 2]);

        // Café (3€) + croissant (2€) = 5€, café offert => 2€ à payer.
        $response = $this->postJson('/api/tickets', [
            'client_id' => null,
            'cash_session_id' => $this->cashSession->id,
            'discount_code' => 'CAFEOFFERT',
            'lines' => [
                ['product_id' => $this->product->id, 'quantity' => 1],
                ['product_id' => $croissant->id, 'quantity' => 1],
            ],
            'payments' => [['payment_method_id' => $this->cash->id, 'value' => 2]],
        ]);

        $response->assertCreated()->assertJsonPath('discount_amount', '3.00');
    }
}
