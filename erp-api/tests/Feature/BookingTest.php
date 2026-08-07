<?php

namespace Tests\Feature;

use App\Mail\BookingConfirmationMail;
use App\Models\Client;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class BookingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->actingAsAdmin();
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

    public function test_create_booking_sends_confirmation_email_when_client_has_email(): void
    {
        Mail::fake();

        $client = Client::query()->create(['firstname' => 'Marie', 'lastname' => 'Dupont', 'email' => 'marie@example.com']);

        $this->postJson('/api/bookings', [
            'client_id' => $client->id, 'number_of_guests' => 2, 'type' => 'dinner', 'date' => '2026-08-15', 'hour' => '20:00',
        ])->assertCreated();

        Mail::assertSent(BookingConfirmationMail::class, fn ($mail) => $mail->hasTo($client->email));
    }

    public function test_create_booking_does_not_send_email_when_client_has_no_email(): void
    {
        Mail::fake();

        $client = Client::query()->create(['firstname' => 'Marie', 'lastname' => 'Dupont']);

        $this->postJson('/api/bookings', [
            'client_id' => $client->id, 'number_of_guests' => 2, 'type' => 'dinner', 'date' => '2026-08-15', 'hour' => '20:00',
        ])->assertCreated();

        Mail::assertNothingSent();
    }

    /**
     * Voir BookingController::store — le try/catch autour de l'envoi ne doit pas transformer un
     * SMTP en rade en 500 côté client alors que la réservation est déjà enregistrée en base.
     * Force une vraie erreur de connexion (port 1 sur localhost, refusé immédiatement) plutôt
     * qu'un mock profond de Illuminate\Mail\Mailer (MailManager construit son driver lui-même,
     * pas résolu via le container — un mock bindé ne serait jamais atteint).
     */
    public function test_create_booking_succeeds_even_when_email_sending_fails(): void
    {
        config([
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => '127.0.0.1',
            'mail.mailers.smtp.port' => 1,
        ]);

        $client = Client::query()->create(['firstname' => 'Marie', 'lastname' => 'Dupont', 'email' => 'marie@example.com']);

        $response = $this->postJson('/api/bookings', [
            'client_id' => $client->id, 'number_of_guests' => 2, 'type' => 'dinner', 'date' => '2026-08-15', 'hour' => '20:00',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('bookings', ['client_id' => $client->id, 'type' => 'dinner']);
    }
}
