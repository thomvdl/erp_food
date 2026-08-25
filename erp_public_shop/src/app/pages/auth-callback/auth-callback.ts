import { Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CustomerSessionService } from '../../core/customer-session.service';

/**
 * Retour de Google après consentement (voir ShopCustomerController::handleGoogleCallback, qui
 * redirige ici avec `?token=...` ou `?error=1`) — page technique, jamais atteinte autrement que par
 * cette redirection. Échange le token contre le client (voir
 * CustomerSessionService.completeGoogleLogin) puis renvoie vers l'URL mémorisée par
 * loginWithGoogle() avant le départ vers Google (pages/login) — `replaceUrl` pour ne jamais laisser
 * le token dans l'historique du navigateur.
 */
@Component({
  selector: 'app-auth-callback',
  imports: [],
  templateUrl: './auth-callback.html',
  styleUrl: './auth-callback.css',
})
export class AuthCallback {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly session = inject(CustomerSessionService);

  readonly deniedByGoogle = signal(false);

  constructor() {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.deniedByGoogle.set(true);
      return;
    }

    this.session.completeGoogleLogin(token);

    effect(() => {
      if (this.session.customer()) {
        this.router.navigateByUrl(this.session.consumeReturnUrl(), { replaceUrl: true });
      }
    });
  }

  backToLogin(): void {
    this.session.consumeReturnUrl();
    this.router.navigateByUrl('/connexion', { replaceUrl: true });
  }
}
