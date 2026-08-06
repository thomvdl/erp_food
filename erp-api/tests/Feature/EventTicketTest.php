<?php

namespace Tests\Feature;

use App\Mail\EventTicketsMail;
use App\Models\Client;
use App\Models\Event;
use App\Models\EventDate;
use App\Models\EventTicket;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class EventTicketTest extends TestCase
{
    use RefreshDatabase;

    private Client $client;
    private EventDate $eventDate;

    protected function setUp(): void
    {
        parent::setUp();

        $this->actingAsAdmin();

        $this->client = Client::query()->create(['firstname' => 'Marie', 'lastname' => 'Dupont']);
        $event = Event::query()->create(['name' => 'Concert de Jazz']);
        $this->eventDate = EventDate::query()->create([
            'event_id' => $event->id,
            'date' => '2026-08-15',
            'start_hour' => '21:00',
            'number_place_limit' => 2,
        ]);
    }

    public function test_store_creates_the_requested_quantity_of_tickets(): void
    {
        $response = $this->postJson('/api/event-tickets', [
            'event_date_id' => $this->eventDate->id,
            'client_id' => $this->client->id,
            'quantity' => 2,
        ]);

        $response->assertCreated()->assertJsonCount(2);
        $this->assertSame(2, EventTicket::query()->count());
    }

    public function test_store_rejects_when_exceeding_the_remaining_capacity(): void
    {
        // Limite posée à 2 (voir setUp) — en vendre 2 d'abord, puis tenter d'en vendre 1 de plus.
        $this->postJson('/api/event-tickets', [
            'event_date_id' => $this->eventDate->id,
            'client_id' => $this->client->id,
            'quantity' => 2,
        ])->assertCreated();

        $response = $this->postJson('/api/event-tickets', [
            'event_date_id' => $this->eventDate->id,
            'client_id' => $this->client->id,
            'quantity' => 1,
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('quantity');
        $this->assertSame(2, EventTicket::query()->count());
    }

    public function test_store_allows_exactly_reaching_the_capacity_limit(): void
    {
        $response = $this->postJson('/api/event-tickets', [
            'event_date_id' => $this->eventDate->id,
            'client_id' => $this->client->id,
            'quantity' => 2,
        ]);

        $response->assertCreated();
    }

    public function test_validate_code_marks_the_ticket_as_validated(): void
    {
        $ticket = $this->postJson('/api/event-tickets', [
            'event_date_id' => $this->eventDate->id,
            'client_id' => $this->client->id,
        ])->json('0');

        $response = $this->postJson('/api/event-tickets/validate', ['code' => $ticket['validation_code']]);

        $response->assertOk();
        $this->assertNotNull($response->json('validated_at'));
    }

    public function test_validate_unknown_code_is_rejected(): void
    {
        $this->postJson('/api/event-tickets/validate', ['code' => 'UNKNOWN1'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('code');
    }

    public function test_validate_an_already_validated_code_is_rejected(): void
    {
        $ticket = $this->postJson('/api/event-tickets', [
            'event_date_id' => $this->eventDate->id,
            'client_id' => $this->client->id,
        ])->json('0');

        $this->postJson('/api/event-tickets/validate', ['code' => $ticket['validation_code']])->assertOk();

        $this->postJson('/api/event-tickets/validate', ['code' => $ticket['validation_code']])
            ->assertStatus(422)
            ->assertJsonValidationErrors('code');
    }

    public function test_validate_code_is_case_insensitive(): void
    {
        $ticket = $this->postJson('/api/event-tickets', [
            'event_date_id' => $this->eventDate->id,
            'client_id' => $this->client->id,
        ])->json('0');

        $this->postJson('/api/event-tickets/validate', ['code' => strtolower($ticket['validation_code'])])
            ->assertOk();
    }

    public function test_qr_endpoint_is_public_and_does_not_require_auth(): void
    {
        $ticket = $this->postJson('/api/event-tickets', [
            'event_date_id' => $this->eventDate->id,
            'client_id' => $this->client->id,
        ])->json('0');

        // Voir routes/api.php : exception volontaire, cette route est hors du groupe
        // auth:sanctum car consommée en <img src="..."> brut (pas d'en-tête possible).
        $response = $this->get("/api/event-tickets/{$ticket['id']}/qr");

        $response->assertOk()->assertHeader('Content-Type', 'image/png');
    }

    public function test_store_sends_codes_by_email_when_requested_and_client_has_email(): void
    {
        Mail::fake();

        $client = Client::query()->create(['firstname' => 'Marie', 'lastname' => 'Dupont', 'email' => 'marie@example.com']);

        $this->postJson('/api/event-tickets', [
            'event_date_id' => $this->eventDate->id,
            'client_id' => $client->id,
            'quantity' => 2,
            'send_email' => true,
        ])->assertCreated();

        Mail::assertSent(EventTicketsMail::class, fn ($mail) => $mail->hasTo($client->email) && count($mail->tickets) === 2);
    }

    public function test_store_does_not_send_email_when_not_requested(): void
    {
        Mail::fake();

        $client = Client::query()->create(['firstname' => 'Marie', 'lastname' => 'Dupont', 'email' => 'marie@example.com']);

        $this->postJson('/api/event-tickets', [
            'event_date_id' => $this->eventDate->id,
            'client_id' => $client->id,
        ])->assertCreated();

        Mail::assertNothingSent();
    }

    /**
     * Voir EventTicketController::sendCodesByEmail — le try/catch autour de l'envoi ne doit pas
     * transformer un SMTP en rade en 500 côté client alors que les places sont déjà vendues.
     * Même approche que BookingTest (connexion refusée sur localhost:1) plutôt qu'un mock de
     * Illuminate\Mail\Mailer — voir le commentaire là-bas pour le pourquoi.
     */
    public function test_store_succeeds_even_when_email_sending_fails(): void
    {
        config([
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => '127.0.0.1',
            'mail.mailers.smtp.port' => 1,
        ]);

        $client = Client::query()->create(['firstname' => 'Marie', 'lastname' => 'Dupont', 'email' => 'marie@example.com']);

        $response = $this->postJson('/api/event-tickets', [
            'event_date_id' => $this->eventDate->id,
            'client_id' => $client->id,
            'quantity' => 2,
            'send_email' => true,
        ]);

        $response->assertCreated();
        $this->assertSame(2, EventTicket::query()->where('client_id', $client->id)->count());
    }
}
