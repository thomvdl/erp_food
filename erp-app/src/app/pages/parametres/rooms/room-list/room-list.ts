import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RoomService } from '../../../../core/room.service';
import { Room } from '../../../../core/models/floor-plan.model';

@Component({
  selector: 'app-room-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './room-list.html',
})
export class RoomList {
  private readonly roomService = inject(RoomService);

  readonly rooms = signal<Room[]>([]);

  constructor() {
    this.refresh();
  }

  typeLabel(room: Room): string {
    switch (room.type) {
      case 'event':
        return 'Événement';
      case 'self_order':
        return 'Self-order';
      default:
        return 'Restaurant';
    }
  }

  private refresh(): void {
    this.roomService.list().subscribe((rooms) => this.rooms.set(rooms));
  }
}
