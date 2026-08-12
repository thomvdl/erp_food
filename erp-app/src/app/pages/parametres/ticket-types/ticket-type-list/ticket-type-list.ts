import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventTicketTypeService } from '../../../../core/event-ticket-type.service';
import { EventTicketType } from '../../../../core/models/event.model';

@Component({
  selector: 'app-ticket-type-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './ticket-type-list.html',
})
export class TicketTypeList {
  private readonly ticketTypeService = inject(EventTicketTypeService);

  readonly ticketTypes = signal<EventTicketType[]>([]);

  constructor() {
    this.refresh();
  }

  private refresh(): void {
    this.ticketTypeService.list().subscribe((ticketTypes) => this.ticketTypes.set(ticketTypes));
  }
}
