<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_request_is_rejected_with_401_not_500(): void
    {
        // Régression : voir CONTEXT.md — une requête sans en-tête "Accept: application/json"
        // plantait en 500 (RouteNotFoundException sur une route web 'login' inexistante) avant
        // le fix de bootstrap/app.php (redirectGuestsTo).
        $this->get('/api/products')->assertStatus(401);
        $this->getJson('/api/products')->assertStatus(401);
    }

    public function test_login_with_correct_password_returns_a_token(): void
    {
        User::factory()->create(['username' => 'admin', 'password' => Hash::make('secret123')]);

        $response = $this->postJson('/api/auth/login', ['username' => 'admin', 'password' => 'secret123']);

        $response->assertOk()->assertJsonStructure(['token', 'user' => ['id', 'username', 'roles']]);
    }

    public function test_login_with_wrong_password_is_rejected(): void
    {
        User::factory()->create(['username' => 'admin', 'password' => Hash::make('secret123')]);

        $this->postJson('/api/auth/login', ['username' => 'admin', 'password' => 'wrong'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('username');
    }

    public function test_login_with_unknown_username_is_rejected(): void
    {
        $this->postJson('/api/auth/login', ['username' => 'ghost', 'password' => 'whatever'])
            ->assertStatus(422);
    }

    public function test_login_with_qr_barcode_returns_a_token(): void
    {
        User::factory()->create(['barcode' => 'ABCDEF1234567']);

        $this->postJson('/api/auth/login', ['barcode' => 'ABCDEF1234567'])
            ->assertOk()
            ->assertJsonStructure(['token', 'user']);
    }

    public function test_login_with_unknown_barcode_is_rejected(): void
    {
        $this->postJson('/api/auth/login', ['barcode' => 'DOES-NOT-EXIST'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('barcode');
    }

    public function test_a_valid_token_grants_access_to_protected_routes(): void
    {
        User::factory()->create(['username' => 'admin', 'password' => Hash::make('secret123')]);
        $token = $this->postJson('/api/auth/login', ['username' => 'admin', 'password' => 'secret123'])
            ->json('token');

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('username', 'admin');
    }

    public function test_logout_revokes_the_token(): void
    {
        $user = User::factory()->create(['username' => 'admin', 'password' => Hash::make('secret123')]);
        $token = $this->postJson('/api/auth/login', ['username' => 'admin', 'password' => 'secret123'])
            ->json('token');

        $this->withHeader('Authorization', "Bearer {$token}")->postJson('/api/auth/logout')->assertNoContent();

        $this->assertSame(0, $user->tokens()->count());

        // Le guard Sanctum mémorise l'utilisateur résolu pour la durée de vie de l'instance
        // (Illuminate\Auth\RequestGuard) — sans ça, cette 2e requête réutiliserait le résultat
        // (positif) de la requête précédente dans le même test au lieu de re-vérifier le token.
        auth()->forgetGuards();

        $this->withHeader('Authorization', "Bearer {$token}")->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_token_expires_after_the_configured_window(): void
    {
        User::factory()->create(['username' => 'admin', 'password' => Hash::make('secret123')]);
        $token = $this->postJson('/api/auth/login', ['username' => 'admin', 'password' => 'secret123'])
            ->json('token');

        // Voir CONTEXT.md : config('sanctum.expiration') = 720 min (12h), appliqué par
        // Laravel\Sanctum\Guard en comparant token.created_at à une fenêtre glissante — pas
        // besoin d'expires_at posé à la création.
        $this->travel(13)->hours();

        $this->withHeader('Authorization', "Bearer {$token}")->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_token_still_valid_just_before_expiration_window(): void
    {
        User::factory()->create(['username' => 'admin', 'password' => Hash::make('secret123')]);
        $token = $this->postJson('/api/auth/login', ['username' => 'admin', 'password' => 'secret123'])
            ->json('token');

        $this->travel(11)->hours();

        $this->withHeader('Authorization', "Bearer {$token}")->getJson('/api/auth/me')->assertOk();
    }
}
