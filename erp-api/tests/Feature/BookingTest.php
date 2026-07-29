<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BookingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Sanctum::actingAs(User::factory()->create());
    }

    public function test_create_booking(): void
    {
        $client = Client::query()->create(['firstname' => 'Marie', 'lastname' => 'Dupont']);

        $response = $this->postJson('/api/bookings', [
            'client_id' => $client->id,
            'number_of_guests' => 4,
            'type' => 'dinner',
            'date' => '2026-08-15',
            'hour' => '20:00',
        ]);

        $response->assertCreated()->assertJsonPath('number_of_guests', 4)->assertJsonPath('client.firstname', 'Marie');
        $this->assertDatabaseHas('bookings', ['client_id' => $client->id, 'type' => 'dinner']);
    }

    public function test_invalid_type_is_rejected(): void
    {
        $client = Client::query()->create(['firstname' => 'Marie', 'lastname' => 'Dupont']);

        $this->postJson('/api/bookings', [
            'client_id' => $client->id,
            'number_of_guests' => 2,
            'type' => 'brunch',
            'date' => '2026-08-15',
            'hour' => '09:00',
        ])->assertStatus(422)->assertJsonValidationErrors('type');
    }

    public function test_list_can_be_filtered_by_date(): void
    {
        $client = Client::query()->create(['firstname' => 'Marie', 'lastname' => 'Dupont']);

        $this->postJson('/api/bookings', [
            'client_id' => $client->id, 'number_of_guests' => 2, 'type' => 'lunch', 'date' => '2026-08-15', 'hour' => '12:00',
        ])->assertCreated();
        $this->postJson('/api/bookings', [
            'client_id' => $client->id, 'number_of_guests' => 2, 'type' => 'lunch', 'date' => '2026-08-16', 'hour' => '12:00',
        ])->assertCreated();

        $response = $this->getJson('/api/bookings?date=2026-08-15');

        $response->assertOk()->assertJsonCount(1);
    }

    public function test_validate_booking_sets_validated_at(): void
    {
        $client = Client::query()->create(['firstname' => 'Marie', 'lastname' => 'Dupont']);
        $bookingId = $this->postJson('/api/bookings', [
            'client_id' => $client->id, 'number_of_guests' => 2, 'type' => 'lunch', 'date' => '2026-08-15', 'hour' => '12:00',
        ])->json('id');

        $response = $this->postJson("/api/bookings/{$bookingId}/validate");

        $response->assertOk();
        $this->assertNotNull($response->json('validated_at'));
    }
}
