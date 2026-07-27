import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RoleService } from '../../../../core/role.service';

@Component({
  selector: 'app-role-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './role-form.html',
})
export class RoleForm {
  private readonly roleService = inject(RoleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);

  readonly name = signal('');
  readonly error = signal<string | null>(null);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.roleService.get(this.id).subscribe({
          next: (role) => this.name.set(role.name),
          error: () => this.error.set('Impossible de charger le rôle.'),
        });
      }
    });
  }

  submit(): void {
    this.error.set(null);

    const payload = { name: this.name() };
    const request =
      this.isEdit() && this.id !== null
        ? this.roleService.update(this.id, payload)
        : this.roleService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/roles'),
      error: () => this.error.set("Impossible d'enregistrer le rôle."),
    });
  }
}
