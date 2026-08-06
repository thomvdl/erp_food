import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClientService } from '../../../core/client.service';
import { Client } from '../../../core/models/ticket.model';

@Component({
  selector: 'app-client-list',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './client-list.html',
})
export class ClientList {
  private readonly clientService = inject(ClientService);

  readonly clients = signal<Client[]>([]);
  readonly nameFilter = signal('');

  readonly filteredClients = computed(() => {
    const name = this.nameFilter().trim().toLowerCase();
    if (!name) {
      return this.clients();
    }
    return this.clients().filter(
      (client) => `${client.firstname} ${client.lastname}`.toLowerCase().includes(name) || (client.email ?? '').toLowerCase().includes(name),
    );
  });

  constructor() {
    this.refresh();
  }

  private refresh(): void {
    this.clientService.list().subscribe((clients) => this.clients.set(clients));
  }
}
