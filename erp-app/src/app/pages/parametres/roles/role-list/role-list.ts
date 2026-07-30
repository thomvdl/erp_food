import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RoleService } from '../../../../core/role.service';
import { Role } from '../../../../core/models/user.model';

@Component({
  selector: 'app-role-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './role-list.html',
})
export class RoleList {
  private readonly roleService = inject(RoleService);

  readonly roles = signal<Role[]>([]);

  constructor() {
    this.refresh();
  }

  private refresh(): void {
    this.roleService.list().subscribe((roles) => this.roles.set(roles));
  }
}
