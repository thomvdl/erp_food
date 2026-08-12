import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface SectionLink {
  icon: string;
  title: string;
  description: string;
  path: string;
}

@Component({
  selector: 'app-parametres-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './parametres-home.html',
})
export class ParametresHome {
  protected readonly sections: SectionLink[] = [
    { icon: '🪑', title: 'Tables & salles', description: 'Position des tables, ajout de salle', path: '/parametres/salles' },
    { icon: '🏷️', title: 'Catégories', description: 'Catégories de produits', path: '/parametres/categories' },
    { icon: '📚', title: 'Catalogues', description: 'Catalogues de produits, un seul actif à la fois', path: '/parametres/catalogues' },
    { icon: '👤', title: 'Utilisateurs', description: 'Comptes et rôles', path: '/parametres/utilisateurs' },
    { icon: '🔑', title: 'Rôles', description: 'Rôles utilisateurs', path: '/parametres/roles' },
    { icon: '👨‍🍳', title: 'Stations', description: 'Postes de préparation', path: '/parametres/stations' },
    { icon: '📣', title: 'Passes', description: "Points d'expédition en cuisine (kitchen display)", path: '/parametres/passes' },
    { icon: '💶', title: 'Taxes', description: 'Taux de TVA', path: '/parametres/taxes' },
    { icon: '🏷️', title: 'Réductions', description: 'Codes promo : pourcentage, montant fixe, produit gratuit', path: '/parametres/reductions' },
    { icon: '🧅', title: 'Ingrédients', description: 'Composition des produits, retirables au panier (ex. sans oignon)', path: '/parametres/ingredients' },
    { icon: '🎟️', title: 'Types de place', description: 'Adulte, Étudiant, Senior… le prix se fixe ensuite par événement', path: '/parametres/types-place' },
    { icon: '🖨️', title: 'Imprimantes', description: 'Une imprimante thermique réseau par poste (caisse, kiosque…)', path: '/parametres/imprimantes' },
    { icon: '⚙️', title: 'Réglages', description: "Paramètres génériques clé/valeur (horaires d'ouverture, etc.)", path: '/parametres/reglages' },
  ];
}
