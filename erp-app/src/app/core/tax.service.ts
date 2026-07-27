import { Injectable } from '@angular/core';
import { CachedResourceService } from './cached-resource.service';
import { Tax } from './models/reference.model';

@Injectable({ providedIn: 'root' })
export class TaxService extends CachedResourceService<Tax> {
  protected readonly endpoint = 'taxes';
}
