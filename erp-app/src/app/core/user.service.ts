import { Injectable } from '@angular/core';
import { CachedResourceService } from './cached-resource.service';
import { User } from './models/user.model';

@Injectable({ providedIn: 'root' })
export class UserService extends CachedResourceService<User> {
  protected readonly endpoint = 'users';
}
