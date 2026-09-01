import { Injectable } from '@angular/core';
import { CachedResourceService } from './cached-resource.service';
import { KioskBanner } from './models/kiosk-banner.model';

@Injectable({ providedIn: 'root' })
export class KioskBannerService extends CachedResourceService<KioskBanner> {
  protected readonly endpoint = 'kiosk-banners';
}
