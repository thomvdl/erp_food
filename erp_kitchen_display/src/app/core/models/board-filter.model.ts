/**
 * Un seul filtre actif à la fois, parmi 5 choix mutuellement exclusifs (voir Readme.md : "on
 * doit pouvoir sélectionner Tout ou tous les postes ou toutes les stations") :
 * - null              : "Tout" — aucune restriction.
 * - all-stations       : "Tous les postes" — aucune restriction non plus, mais reste dans le
 *   groupe "Postes" (déclenche quand même la règle "section prête retirée de la vue Poste").
 * - { station, id }    : un poste précis.
 * - all-passes         : "Tous les passes" — aucune restriction, groupe "Passes".
 * - { passe, id }      : un passe précis.
 *
 * Extrait de kitchen-board.ts (2026-09-22) pour être partagé avec poste-select.ts (écran de
 * choix affiché après connexion) et ActiveKitchenFilterService (persistance locale du choix).
 */
export type BoardFilter =
  | null
  | { kind: 'all-stations' }
  | { kind: 'station'; id: number }
  | { kind: 'all-passes' }
  | { kind: 'passe'; id: number };
