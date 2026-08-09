import { Injectable } from '@angular/core';
import { CachedResourceService } from './cached-resource.service';
import { Param } from './models/reference.model';

@Injectable({ providedIn: 'root' })
export class ParamService extends CachedResourceService<Param> {
  protected readonly endpoint = 'params';
}
