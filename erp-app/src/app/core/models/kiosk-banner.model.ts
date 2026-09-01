export interface KioskBanner {
  id: number;
  title: string | null;
  subtitle: string | null;
  /** Ordre d'affichage dans le carrousel (croissant) — voir KioskBannerController::index, orderBy. */
  position: number;
  active: boolean;
  image_url: string | null;
}
