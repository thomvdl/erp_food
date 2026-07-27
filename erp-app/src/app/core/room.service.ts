import { Injectable } from '@angular/core';
import { CachedResourceService } from './cached-resource.service';
import { Room } from './models/floor-plan.model';

@Injectable({ providedIn: 'root' })
export class RoomService extends CachedResourceService<Room> {
  protected readonly endpoint = 'rooms';
}
