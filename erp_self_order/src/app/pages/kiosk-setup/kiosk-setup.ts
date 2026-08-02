import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { KioskService } from '../../core/kiosk.service';
import { CashSession } from '../../core/models/kiosk.model';

/**
 * Étape entre la connexion et l'écran client (kiosk-order) : ce kiosque est un appareil
 * authentifié classique, donc "avoir une caisse ouverte avant d'encaisser" (voir Readme.md)
 * s'applique ici aussi — chaque vente créée par le kiosque est rattachée à la session ouverte de
 * l'utilisateur qui vient de se connecter (pas de sélecteur de caissier, contrairement à
 * erp-app : un kiosque n'a qu'un seul utilisateur à la fois).
 */
@Component({
  selector: 'app-kiosk-setup',
  imports: [FormsModule],
  templateUrl: './kiosk-setup.html',
  styleUrl: './kiosk-setup.css',
})
export class KioskSetup implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly kioskService = inject(KioskService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly session = signal<CashSession | null>(null);
  readonly openingAmount = signal<number | null>(0);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  private refresh(): void {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;
    this.loading.set(true);
    this.kioskService.activeCashSession(userId).subscribe({
      next: (session) => {
        this.session.set(session);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openSession(): void {
    const userId = this.authService.currentUser()?.id;
    if (!userId || this.openingAmount() === null || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);

    this.kioskService.openCashSession({ user_id: userId, opening_amount: this.openingAmount()! }).subscribe({
      next: (session) => {
        this.submitting.set(false);
        this.session.set(session);
      },
      error: (err) => {
        this.submitting.set(false);
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.error.set(messages?.length ? messages.join(' ') : "Impossible d'ouvrir la caisse.");
      },
    });
  }

  startKiosk(): void {
    this.router.navigateByUrl('/kiosk');
  }

  logout(): void {
    this.authService.logout().subscribe();
  }
}
