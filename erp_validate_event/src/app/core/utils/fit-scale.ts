/**
 * Facteur d'échelle pour faire tenir une zone de contenu de taille fixe (ex. room.width/height)
 * dans un conteneur de taille variable, sans déborder dans aucune dimension — même principe que
 * CSS `object-fit: contain`, appliqué via `transform: scale()` à un plan de salle dessiné en
 * position absolue (échelle 1 = coordonnées room.width/height) plutôt qu'à une image. Copié tel
 * quel depuis erp-app/src/app/core/utils/fit-scale.ts (pas de package partagé entre les apps).
 */
export function computeFitScale(
  containerWidth: number,
  containerHeight: number,
  contentWidth: number,
  contentHeight: number,
): number {
  if (contentWidth <= 0 || contentHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return 1;
  }

  return Math.min(containerWidth / contentWidth, containerHeight / contentHeight);
}
