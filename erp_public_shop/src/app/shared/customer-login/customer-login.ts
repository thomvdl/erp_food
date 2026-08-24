import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CustomerSessionService } from '../../core/customer-session.service';

/**
 * Badge topbar "compte client" — voir CustomerSessionService (état partagé/persisté) et
 * ShopCustomerController côté API (téléphone + email vérifié par code). Même famille que
 * shared/delivery-address : composant autonome ajouté dans .shop-header de pages/catalog et
 * pages/checkout.
 */
@Component({
  selector: 'app-customer-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './customer-login.html',
  styleUrl: './customer-login.css',
})
export class CustomerLogin {
  readonly session = inject(CustomerSessionService);

  readonly open = signal(false);
  readonly phoneDraft = signal('');
  readonly emailDraft = signal('');
  readonly codeDraft = signal('');
  readonly firstnameDraft = signal('');
  readonly lastnameDraft = signal('');

  readonly label = computed(() => {
    const customer = this.session.customer();
    return customer ? `${customer.firstname} · ${customer.points_balance} pts` : 'Se connecter';
  });

  toggle(): void {
    this.open.set(!this.open());
  }

  close(): void {
    this.open.set(false);
    this.session.error.set(null);
  }

  requestCode(): void {
    if (this.session.needsSignup()) {
      this.session.requestCode(this.phoneDraft(), this.emailDraft(), this.firstnameDraft(), this.lastnameDraft());
      return;
    }
    this.session.requestCode(this.phoneDraft(), this.emailDraft());
  }

  verifyCode(): void {
    this.session.verifyCode(this.codeDraft());
  }

  backToForm(): void {
    this.session.cancelPendingCode();
    this.codeDraft.set('');
  }

  logout(): void {
    this.session.logout();
    this.phoneDraft.set('');
    this.emailDraft.set('');
    this.codeDraft.set('');
    this.firstnameDraft.set('');
    this.lastnameDraft.set('');
  }
}
