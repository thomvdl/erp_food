<?php

namespace Tests\Feature;

use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CashSessionTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private PaymentMethod $cash;
    private PaymentMethod $card;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        Sanctum::actingAs($this->user);

        $this->cash = PaymentMethod::query()->create(['name' => 'Espèces', 'slug' => 'especes']);
        $this->card = PaymentMethod::query()->create(['name' => 'Carte bancaire', 'slug' => 'carte-bancaire']);
        $this->product = Product::query()->create(['name' => 'Café', 'slug' => 'cafe', 'price' => 3]);
    }

    public function test_active_session_is_null_like_when_none_is_open(): void
    {
        $response = $this->getJson("/api/cash-sessions/active?user_id={$this->user->id}");

        $response->assertOk();
        $this->assertSame([], $response->json());
    }

    public function test_open_a_session(): void
    {
        $response = $this->postJson('/api/cash-sessions', ['user_id' => $this->user->id, 'opening_amount' => 100]);

        $response->assertCreated()->assertJsonPath('user.id', $this->user->id);
        $this->assertDatabaseHas('cash_sessions', ['user_id' => $this->user->id, 'closed_at' => null]);
    }

    public function test_cannot_open_a_second_session_while_one_is_already_open(): void
    {
        $this->postJson('/api/cash-sessions', ['user_id' => $this->user->id, 'opening_amount' => 100])->assertCreated();

        $this->postJson('/api/cash-sessions', ['user_id' => $this->user->id, 'opening_amount' => 50])
            ->assertStatus(422)
            ->assertJsonValidationErrors('user_id');
    }

    public function test_closing_requires_a_cash_entry(): void
    {
        $sessionId = $this->postJson('/api/cash-sessions', ['user_id' => $this->user->id, 'opening_amount' => 100])->json('id');

        $this->postJson("/api/cash-sessions/{$sessionId}/close", [
            'counts' => [['payment_method_id' => $this->card->id, 'counted_amount' => 10]],
        ])->assertStatus(422)->assertJsonValidationErrors('counts');
    }

    public function test_closing_a_session_reconciles_each_payment_method_independently(): void
    {
        $session = $this->postJson('/api/cash-sessions', ['user_id' => $this->user->id, 'opening_amount' => 100])->json();

        // Une vente en espèces (9€) et une vente en carte (9€), rattachées à la session — voir
        // TicketController::store qui stampe user_id/cash_session_id depuis la session fournie.
        $this->postJson('/api/tickets', [
            'client_id' => null,
            'cash_session_id' => $session['id'],
            'lines' => [['product_id' => $this->product->id, 'quantity' => 3]],
            'payments' => [['payment_method_id' => $this->cash->id, 'value' => 9]],
        ])->assertCreated();

        $this->postJson('/api/tickets', [
            'client_id' => null,
            'cash_session_id' => $session['id'],
            'lines' => [['product_id' => $this->product->id, 'quantity' => 3]],
            'payments' => [['payment_method_id' => $this->card->id, 'value' => 9]],
        ])->assertCreated();

        // 100 (fond) + 9 (vente espèces) = 109 attendu en caisse ; la carte n'a que ses ventes (9),
        // pas de fond — voir CONTEXT.md.
        $response = $this->postJson("/api/cash-sessions/{$session['id']}/close", [
            'counts' => [
                ['payment_method_id' => $this->cash->id, 'counted_amount' => 109],
                ['payment_method_id' => $this->card->id, 'counted_amount' => 9],
            ],
        ]);

        $response->assertOk();
        $this->assertEquals(109, $response->json('closing_amount'));
        $this->assertEquals(109, $response->json('expected_amount'));
        $this->assertEquals(0, $response->json('discrepancy'));

        $this->assertDatabaseHas('cash_session_counts', [
            'cash_session_id' => $session['id'],
            'payment_method_id' => $this->cash->id,
            'expected_amount' => 109,
            'discrepancy' => 0,
        ]);
        $this->assertDatabaseHas('cash_session_counts', [
            'cash_session_id' => $session['id'],
            'payment_method_id' => $this->card->id,
            'expected_amount' => 9,
            'discrepancy' => 0,
        ]);
    }

    public function test_closing_reports_a_discrepancy_when_counted_amount_differs(): void
    {
        $session = $this->postJson('/api/cash-sessions', ['user_id' => $this->user->id, 'opening_amount' => 100])->json();

        // 90 compté au lieu des 100 attendus (aucune vente) : -10 d'écart, un tiroir qui a une
        // erreur de caisse doit être détecté, pas juste enregistré sans signal.
        $response = $this->postJson("/api/cash-sessions/{$session['id']}/close", [
            'counts' => [['payment_method_id' => $this->cash->id, 'counted_amount' => 90]],
        ]);

        $response->assertOk();
        $this->assertEquals(-10, $response->json('discrepancy'));
    }

    public function test_cannot_close_an_already_closed_session(): void
    {
        $session = $this->postJson('/api/cash-sessions', ['user_id' => $this->user->id, 'opening_amount' => 100])->json();
        $this->postJson("/api/cash-sessions/{$session['id']}/close", [
            'counts' => [['payment_method_id' => $this->cash->id, 'counted_amount' => 100]],
        ])->assertOk();

        $this->postJson("/api/cash-sessions/{$session['id']}/close", [
            'counts' => [['payment_method_id' => $this->cash->id, 'counted_amount' => 100]],
        ])->assertStatus(422);
    }
}
