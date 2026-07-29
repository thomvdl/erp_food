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
    return room.type === 'event' ? 'Événement' : 'Restaurant';
  }

  remove(room: Room): void {
    if (!confirm(`Supprimer la salle "${room.name}" ?`)) {
      return;
    }

    this.roomService.remove(room.id).subscribe(() => this.refresh());
  }

  private refresh(): void {
    this.roomService.list().subscribe((rooms) => this.rooms.set(rooms));
  }
}
