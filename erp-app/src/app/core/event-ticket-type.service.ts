import { Injectable } from '@angular/core';
import { CachedResourceService } from './cached-resource.service';
import { EventTicketType } from './models/event.model';

@Injectable({ providedIn: 'root' })
export class EventTicketTypeService extends CachedResourceService<EventTicketType> {
  protected readonly endpoint = 'event-ticket-types';
}
