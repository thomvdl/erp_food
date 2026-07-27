import { Injectable } from '@angular/core';
import { CachedResourceService } from './cached-resource.service';
import { Station } from './models/reference.model';

@Injectable({ providedIn: 'root' })
export class StationService extends CachedResourceService<Station> {
  protected readonly endpoint = 'stations';
}
