import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UserService } from '../../../../core/user.service';
import { RoleService } from '../../../../core/role.service';
import { Role } from '../../../../core/models/user.model';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './user-form.html',
})
export class UserForm {
  private readonly userService = inject(UserService);
  private readonly roleService = inject(RoleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);

  readonly roles = signal<Role[]>([]);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  readonly username = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly roleIds = signal<number[]>([]);

  constructor() {
    this.roleService.list().subscribe((roles) => this.roles.set(roles));

    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.userService.get(this.id).subscribe({
          next: (user) => {
            this.username.set(user.username);
            this.email.set(user.email);
            this.roleIds.set(user.roles.map((role) => role.id));
          },
          error: () => this.error.set("Impossible de charger l'utilisateur."),
        });
      }
    });
  }

  isRoleChecked(roleId: number): boolean {
    return this.roleIds().includes(roleId);
  }

  toggleRole(roleId: number, checked: boolean): void {
    const current = this.roleIds();
    this.roleIds.set(checked ? [...current, roleId] : current.filter((id) => id !== roleId));
  }

  submit(): void {
    this.error.set(null);

    if (!this.isEdit() && !this.password()) {
      this.error.set('Le mot de passe est obligatoire pour un nouvel utilisateur.');
      return;
    }

    this.saving.set(true);

    const payload = {
      username: this.username(),
      email: this.email(),
      password: this.password() || undefined,
      role_ids: this.roleIds(),
    };

    const request =
      this.isEdit() && this.id !== null
        ? this.userService.update(this.id, payload)
        : this.userService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/utilisateurs'),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(this.extractErrorMessage(err));
      },
    });
  }

  private extractErrorMessage(err: HttpErrorResponse): string {
    const errors = err.error?.errors as Record<string, string[]> | undefined;

    if (errors) {
      return Object.values(errors).flat().join(' ');
    }

    return "Impossible d'enregistrer l'utilisateur.";
  }
}
