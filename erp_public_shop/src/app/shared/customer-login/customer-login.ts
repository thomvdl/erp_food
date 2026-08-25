import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CustomerSessionService } from '../../core/customer-session.service';

/**
 * Badge topbar "compte client" — bouton "Se connecter" (vers pages/login) si personne n'est
 * connecté, sinon nom + points avec un petit menu (historique, déconnexion). Le catalogue reste
 * parcourable en anonyme (voir app.routes.ts) : seul le checkout exige d'être connecté (voir
 * core/auth.guard.ts), ce composant ne force donc jamais rien lui-même. Même famille que
 * shared/delivery-address : composant autonome ajouté dans .shop-header de pages/catalog et
 * pages/checkout.
 */
@Component({
  selector: 'app-customer-login',
  imports: [RouterLink],
  templateUrl: './customer-login.html',
  styleUrl: './customer-login.css',
})
export class CustomerLogin {
  private readonly router = inject(Router);
  readonly session = inject(CustomerSessionService);

  readonly open = signal(false);

  toggle(): void {
    this.open.set(!this.open());
  }

  close(): void {
    this.open.set(false);
  }

  logout(): void {
    this.session.logout();
    this.close();
    // Si on est sur une page garde-fouée (checkout, voir auth.guard.ts) au moment de la
    // déconnexion, la garde ne se réévalue qu'à la navigation — sans ce push, la page resterait
    // affichée avec un client `null`. Vers l'accueil (jamais garde-fouée) plutôt que /connexion :
    // rien n'oblige à se reconnecter tout de suite après une déconnexion volontaire.
    this.router.navigateByUrl('/');
  }
}
