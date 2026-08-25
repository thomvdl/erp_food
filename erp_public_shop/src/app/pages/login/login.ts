import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CustomerSessionService } from '../../core/customer-session.service';

/**
 * Écran de connexion obligatoire (voir core/auth.guard.ts) — seul point d'entrée désormais pour se
 * connecter (shared/customer-login, réduit à l'état connecté, ne propose plus ce formulaire).
 * Trois méthodes : Google (CustomerSessionService.loginWithGoogle — navigation pleine page, voir
 * pages/auth-callback pour le retour), email + mot de passe (authenticate()/register(), toggle
 * `mode`), ou un code à 6 chiffres par email (requestOtp()/verifyOtp()) — `authMethod` bascule
 * entre les deux derniers, Google reste toujours visible à part. Navigue vers `returnUrl` (query
 * param posé par auth.guard.ts, défaut "/") dès que `session.customer()` devient non nul, quelle
 * que soit la méthode utilisée.
 */
@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly session = inject(CustomerSessionService);

  private readonly returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';

  readonly authMethod = signal<'password' | 'otp'>('password');
  readonly mode = signal<'login' | 'register'>('login');

  readonly emailDraft = signal('');
  readonly passwordDraft = signal('');
  readonly passwordConfirmDraft = signal('');
  readonly phoneDraft = signal('');
  readonly firstnameDraft = signal('');
  readonly lastnameDraft = signal('');
  readonly otpCodeDraft = signal('');

  /** Vérifiée uniquement côté front — jamais envoyée au backend, voir submit(). */
  readonly passwordsMismatch = computed(
    () => this.mode() === 'register' && this.passwordConfirmDraft().length > 0 && this.passwordDraft() !== this.passwordConfirmDraft(),
  );

  readonly canSubmit = computed(() => {
    if (this.session.loading() || !this.emailDraft().trim() || this.passwordDraft().length < 8) return false;
    if (this.mode() === 'login') return true;
    return !!this.firstnameDraft().trim() && !!this.lastnameDraft().trim() && !this.passwordsMismatch();
  });

  constructor() {
    effect(() => {
      if (this.session.customer()) {
        this.router.navigateByUrl(this.returnUrl);
      }
    });
  }

  continueWithGoogle(): void {
    this.session.loginWithGoogle(this.returnUrl);
  }

  switchAuthMethod(method: 'password' | 'otp'): void {
    this.authMethod.set(method);
    this.session.cancelPendingOtp();
    this.session.error.set(null);
  }

  toggleMode(): void {
    this.mode.set(this.mode() === 'login' ? 'register' : 'login');
    this.session.error.set(null);
  }

  submit(): void {
    if (!this.canSubmit()) return;
    if (this.mode() === 'register') {
      this.session.register(this.emailDraft(), this.passwordDraft(), this.firstnameDraft(), this.lastnameDraft(), this.phoneDraft() || null);
      return;
    }
    this.session.authenticate(this.emailDraft(), this.passwordDraft());
  }

  requestOtp(): void {
    if (this.session.needsOtpSignup()) {
      this.session.requestOtp(this.emailDraft(), this.firstnameDraft(), this.lastnameDraft());
      return;
    }
    this.session.requestOtp(this.emailDraft());
  }

  verifyOtp(): void {
    this.session.verifyOtp(this.otpCodeDraft());
  }

  backToOtpForm(): void {
    this.session.cancelPendingOtp();
    this.otpCodeDraft.set('');
  }
}
