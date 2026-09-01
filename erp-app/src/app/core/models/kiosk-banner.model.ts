export type KioskBannerTextPosition = 'top' | 'center' | 'bottom';
export type KioskBannerTextSize = 'small' | 'medium' | 'large';

export interface KioskBanner {
  id: number;
  title: string | null;
  subtitle: string | null;
  /** Ordre d'affichage dans le carrousel (croissant) — voir KioskBannerController::index, orderBy. */
  position: number;
  active: boolean;
  image_url: string | null;
  /** Utilisé quand image_url est null — sans ça le fond serait transparent. */
  background_color: string | null;
  text_position: KioskBannerTextPosition;
  text_size: KioskBannerTextSize;
}
