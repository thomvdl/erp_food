import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth.service';

interface SectionLink {
  icon: string;
  title: string;
  description: string;
  path: string;
  /** Voir shell.ts::NavItem — absent = accessible à tous les rôles authentifiés, comme
   *  "Gestion des commandes" qui n'a jamais été restreint contrairement aux 4 autres. */
  requiredRole?: 'superviseur';
}

@Component({
  selector: 'app-gestion-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './gestion-home.html',
})
export class GestionHome {
  private readonly authService = inject(AuthService);

  private readonly allSections: SectionLink[] = [
    { icon: '🎫', title: 'Événements', description: 'Créer et gérer les événements et leurs dates', path: '/gestion/evenements', requiredRole: 'superviseur' },
    { icon: '📋', title: 'Commandes', description: 'Suivi des commandes en cours et passées', path: '/gestion/commandes' },
    { icon: '🚚', title: 'Livraison', description: 'Commandes de la boutique en ligne à livrer', path: '/gestion/livraison' },
    { icon: '🧾', title: 'Tickets', description: 'Historique des tickets encaissés', path: '/gestion/tickets', requiredRole: 'superviseur' },
    { icon: '🍔', title: 'Produits', description: 'Catalogue produits, prix, composition', path: '/gestion/produits', requiredRole: 'superviseur' },
    { icon: '👤', title: 'Clients', description: 'Fiches clients et historique', path: '/gestion/clients', requiredRole: 'superviseur' },
  ];

  /** Même filtrage que shell.ts::navItems, pour ne pas afficher une tuile qui redirigerait. */
  protected readonly sections = computed(() =>
    this.allSections.filter((section) => section.requiredRole !== 'superviseur' || this.authService.isAtLeastSuperviseur()),
  );
}
