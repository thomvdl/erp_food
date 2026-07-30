import { Injectable } from '@angular/core';
import { CachedResourceService } from './cached-resource.service';
import { Passe } from './models/reference.model';

@Injectable({ providedIn: 'root' })
export class PasseService extends CachedResourceService<Passe> {
  protected readonly endpoint = 'passes';
}
