import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UserService } from '../../../../core/user.service';
import { User } from '../../../../core/models/user.model';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './user-list.html',
})
export class UserList {
  private readonly userService = inject(UserService);

  readonly users = signal<User[]>([]);

  constructor() {
    this.refresh();
  }

  roleNames(user: User): string {
    return user.roles.map((role) => role.name).join(', ') || '—';
  }

  private refresh(): void {
    this.userService.list().subscribe((users) => this.users.set(users));
  }
}
