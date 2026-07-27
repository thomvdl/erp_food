import { Injectable } from '@angular/core';
import { CachedResourceService } from './cached-resource.service';
import { Role } from './models/user.model';

@Injectable({ providedIn: 'root' })
export class RoleService extends CachedResourceService<Role> {
  protected readonly endpoint = 'roles';
}
