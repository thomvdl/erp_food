<?php

namespace Tests\Feature;

use App\Mail\UserQrCodeMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserQrCodeTest extends TestCase
{
    use RefreshDatabase;

    public function test_generating_a_qr_code_sets_a_barcode(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $user = User::factory()->create(['barcode' => null]);

        $response = $this->postJson("/api/users/{$user->id}/qr-code");

        $response->assertOk();
        $this->assertNotNull($response->json('barcode'));
        $this->assertSame($response->json('barcode'), $user->fresh()->barcode);
    }

    public function test_regenerating_replaces_the_previous_barcode(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $user = User::factory()->create(['barcode' => 'OLD0000000001']);

        $response = $this->postJson("/api/users/{$user->id}/qr-code");

        $response->assertOk();
        $this->assertNotSame('OLD0000000001', $response->json('barcode'));
    }

    public function test_qr_image_returns_a_png_once_generated(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $user = User::factory()->create(['barcode' => 'ABCDEF1234567']);

        $this->get("/api/users/{$user->id}/qr")->assertOk()->assertHeader('Content-Type', 'image/png');
    }

    public function test_qr_image_is_404_before_any_code_is_generated(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $user = User::factory()->create(['barcode' => null]);

        $this->get("/api/users/{$user->id}/qr")->assertNotFound();
    }

    public function test_qr_routes_require_authentication(): void
    {
        // Contrairement au QR d'un billet d'événement (public, voir EventTicketTest), le QR de
        // connexion d'un utilisateur est un mot de passe — il doit rester protégé.
        $user = User::factory()->create(['barcode' => 'ABCDEF1234567']);

        $this->withHeader('Authorization', 'Bearer invalid-token')->get("/api/users/{$user->id}/qr")->assertStatus(401);
    }

    public function test_sending_the_qr_by_email_requires_a_code_to_exist_first(): void
    {
        Sanctum::actingAs(User::factory()->create());
        Mail::fake();
        $user = User::factory()->create(['barcode' => null]);

        $this->postJson("/api/users/{$user->id}/qr-code/email")
            ->assertStatus(422)
            ->assertJsonValidationErrors('barcode');

        Mail::assertNothingSent();
    }

    public function test_sending_the_qr_by_email_dispatches_the_mailable(): void
    {
        Sanctum::actingAs(User::factory()->create());
        Mail::fake();
        $user = User::factory()->create(['barcode' => 'ABCDEF1234567', 'email' => 'staff@example.test']);

        $this->postJson("/api/users/{$user->id}/qr-code/email")->assertNoContent();

        Mail::assertSent(UserQrCodeMail::class, fn (UserQrCodeMail $mail) => $mail->hasTo('staff@example.test'));
    }
}
