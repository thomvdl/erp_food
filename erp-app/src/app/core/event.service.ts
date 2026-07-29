import { Injectable } from '@angular/core';
import { CachedResourceService } from './cached-resource.service';
import { Event } from './models/event.model';

@Injectable({ providedIn: 'root' })
export class EventService extends CachedResourceService<Event> {
  protected readonly endpoint = 'events';
}
