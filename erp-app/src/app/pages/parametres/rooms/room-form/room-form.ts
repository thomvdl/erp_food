import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RoomService } from '../../../../core/room.service';
import { RoomType } from '../../../../core/models/floor-plan.model';

@Component({
  selector: 'app-room-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './room-form.html',
})
export class RoomForm {
  private readonly roomService = inject(RoomService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);

  readonly name = signal('');
  readonly type = signal<RoomType>('restaurant');
  readonly error = signal<string | null>(null);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.roomService.get(this.id).subscribe({
          next: (room) => {
            this.name.set(room.name);
            this.type.set(room.type);
          },
          error: () => this.error.set('Impossible de charger la salle.'),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);

    const payload = { name: this.name(), type: this.type() };
    const request =
      this.isEdit() && this.id !== null
        ? this.roomService.update(this.id, payload)
        : this.roomService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/salles'),
      error: () => this.error.set("Impossible d'enregistrer la salle."),
    });
  }
}
