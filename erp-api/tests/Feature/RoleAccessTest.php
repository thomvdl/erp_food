<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\Role;
use App\Models\Room;
use App\Models\TableElement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * "Il n'y aura que trois rôles" (voir Readme.md) : admin = Paramètres complets, superviseur =
 * tout le reste sauf Paramètres (caisse, rapports, réductions au paiement, corrections), user =
 * juste les POS (vente/encaissement, sans réduction ni correction). Couvre les 3 rôles sur un
 * échantillon représentatif de chaque palier plutôt que chaque route une par une.
 */
class RoleAccessTest extends TestCase
{
    use RefreshDatabase;

    private PaymentMethod $cash;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $this->cash = PaymentMethod::query()->create(['name' => 'Espèces', 'slug' => 'especes']);
        $this->product = Product::query()->create(['name' => 'Café', 'slug' => 'cafe', 'price' => 3]);
    }

    private function actingAsRole(string $slug): User
    {
        $user = User::factory()->create();
        $role = Role::query()->firstOrCreate(['slug' => $slug], ['name' => ucfirst($slug)]);
        $user->roles()->attach($role);

        Sanctum::actingAs($user);

        return $user;
    }

    // --- Paramètres : admin uniquement ---

    public function test_admin_can_create_a_product_category(): void
    {
        $this->actingAsRole('admin');

        $this->postJson('/api/product-categories', ['name' => 'Boissons'])->assertCreated();
    }

    public function test_superviseur_cannot_create_a_product_category(): void
    {
        $this->actingAsRole('superviseur');

        $this->postJson('/api/product-categories', ['name' => 'Boissons'])->assertStatus(403);
    }

    public function test_user_cannot_create_a_product_category(): void
    {
        $this->actingAsRole('user');

        $this->postJson('/api/product-categories', ['name' => 'Boissons'])->assertStatus(403);
    }

    // --- Caisse : superviseur+ pour ouvrir/fermer/consulter l'historique, tous pour /active ---

    public function test_user_cannot_open_a_cash_session(): void
    {
        $user = $this->actingAsRole('user');

        $this->postJson('/api/cash-sessions', ['user_id' => $user->id, 'opening_amount' => 100])->assertStatus(403);
    }

    public function test_superviseur_can_open_a_cash_session(): void
    {
        $user = $this->actingAsRole('superviseur');

        $this->postJson('/api/cash-sessions', ['user_id' => $user->id, 'opening_amount' => 100])->assertCreated();
    }

    public function test_user_can_check_the_active_cash_session(): void
    {
        $user = $this->actingAsRole('user');

        $this->getJson("/api/cash-sessions/active?user_id={$user->id}")->assertOk();
    }

    // --- Rapports : Gestion des tickets réservée à superviseur+ ---

    public function test_user_cannot_list_tickets(): void
    {
        $this->actingAsRole('user');

        $this->getJson('/api/tickets')->assertStatus(403);
    }

    public function test_superviseur_can_list_tickets(): void
    {
        $this->actingAsRole('superviseur');

        $this->getJson('/api/tickets')->assertOk();
    }

    // --- Réductions au paiement : superviseur+ ---

    public function test_user_cannot_apply_a_discount_code_at_checkout(): void
    {
        $user = $this->actingAsRole('user');
        \App\Models\Discount::query()->create([
            'code' => 'PROMO10', 'type' => 'percentage', 'value' => 10,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);
        $cashSession = \App\Models\CashSession::query()->create(['user_id' => $user->id, 'opening_amount' => 0, 'opened_at' => now()]);

        $this->postJson('/api/tickets', [
            'client_id' => null,
            'cash_session_id' => $cashSession->id,
            'discount_code' => 'PROMO10',
            'lines' => [['product_id' => $this->product->id, 'quantity' => 1]],
            'payments' => [['payment_method_id' => $this->cash->id, 'value' => 2.7]],
        ])->assertStatus(403);
    }

    public function test_user_can_sell_without_a_discount_code(): void
    {
        $user = $this->actingAsRole('user');
        $cashSession = \App\Models\CashSession::query()->create(['user_id' => $user->id, 'opening_amount' => 0, 'opened_at' => now()]);

        $this->postJson('/api/tickets', [
            'client_id' => null,
            'cash_session_id' => $cashSession->id,
            'lines' => [['product_id' => $this->product->id, 'quantity' => 1]],
            'payments' => [['payment_method_id' => $this->cash->id, 'value' => 3]],
        ])->assertCreated();
    }

    public function test_superviseur_can_apply_a_discount_code_at_checkout(): void
    {
        $user = $this->actingAsRole('superviseur');
        \App\Models\Discount::query()->create([
            'code' => 'PROMO10', 'type' => 'percentage', 'value' => 10,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);
        $cashSession = \App\Models\CashSession::query()->create(['user_id' => $user->id, 'opening_amount' => 0, 'opened_at' => now()]);

        $this->postJson('/api/tickets', [
            'client_id' => null,
            'cash_session_id' => $cashSession->id,
            'discount_code' => 'PROMO10',
            'lines' => [['product_id' => $this->product->id, 'quantity' => 1]],
            'payments' => [['payment_method_id' => $this->cash->id, 'value' => 2.7]],
        ])->assertCreated();
    }

    // --- Corrections de commande : superviseur+ ---

    public function test_user_cannot_correct_an_order(): void
    {
        $this->actingAsRole('user');

        $room = Room::query()->create(['name' => 'Salle', 'slug' => 'salle', 'type' => 'restaurant']);
        $table = TableElement::query()->create([
            'type' => 'table', 'label' => 'T1', 'pos_left' => 0, 'pos_top' => 0,
            'width' => 50, 'height' => 50, 'room_id' => $room->id,
        ]);
        $order = Order::query()->create(['table_id' => $table->id, 'number_of_guests' => 2, 'state' => 'send', 'source' => 'pos_restaurant']);

        $this->postJson("/api/orders/{$order->id}/corrections", [
            'lines' => [['product_id' => $this->product->id, 'quantity' => 1]],
        ])->assertStatus(403);
    }

    // --- Lecture : le catalogue produit/salles reste ouvert à tous les rôles (le POS en a besoin) ---

    public function test_user_can_read_products_and_rooms(): void
    {
        $this->actingAsRole('user');

        $this->getJson('/api/products')->assertOk();
        $this->getJson('/api/rooms')->assertOk();
    }

    // --- Gestion des commandes / Réservations : ouvertes à tous les rôles (voir Readme.md) ---

    public function test_user_can_list_orders(): void
    {
        $this->actingAsRole('user');

        $this->getJson('/api/orders')->assertOk();
    }

    public function test_user_can_manage_bookings(): void
    {
        $this->actingAsRole('user');
        $client = \App\Models\Client::query()->create(['firstname' => 'Jean', 'lastname' => 'Dupont']);

        $this->getJson('/api/bookings')->assertOk();

        $this->postJson('/api/bookings', [
            'client_id' => $client->id,
            'number_of_guests' => 2,
            'type' => 'lunch',
            'date' => now()->addDay()->toDateString(),
            'hour' => '12:00',
        ])->assertCreated();
    }
}
