import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { BookingService } from '../../../core/booking.service';
import { ClientService } from '../../../core/client.service';
import { BookingType } from '../../../core/models/booking.model';
import { Client } from '../../../core/models/ticket.model';
import { DatePicker } from '../../../shared/date-picker/date-picker';
import { TimePicker } from '../../../shared/time-picker/time-picker';

interface BookingTypeOption {
  value: BookingType;
  label: string;
}

const BOOKING_TYPES: BookingTypeOption[] = [
  { value: 'breakfast', label: 'Petit déjeuner' },
  { value: 'lunch', label: 'Déjeuner' },
  { value: 'dinner', label: 'Souper' },
];

@Component({
  selector: 'app-booking-form',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePicker, TimePicker],
  templateUrl: './booking-form.html',
})
export class BookingForm {
  private readonly bookingService = inject(BookingService);
  private readonly clientService = inject(ClientService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  readonly bookingTypes = BOOKING_TYPES;

  readonly type = signal<BookingType>('dinner');
  readonly date = signal(this.todayIso());
  readonly hour = signal('');
  readonly numberOfGuests = signal(2);

  // --- Sélecteur client (même pattern que POS Vente directe) ---
  readonly clientSearch = signal('');
  readonly clientResults = signal<Client[]>([]);
  readonly selectedClient = signal<Client | null>(null);
  readonly showNewClientForm = signal(false);
  readonly newClientFirstname = signal('');
  readonly newClientLastname = signal('');
  readonly newClientPhone = signal('');
  readonly savingClient = signal(false);

  private readonly clientSearch$ = new Subject<string>();

  constructor() {
    this.clientSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => this.clientService.search(query)),
      )
      .subscribe((results) => this.clientResults.set(results));

    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.bookingService.get(this.id).subscribe({
          next: (booking) => {
            this.type.set(booking.type);
            this.date.set(booking.date.slice(0, 10));
            this.hour.set(booking.hour.slice(0, 5));
            this.numberOfGuests.set(booking.number_of_guests);
            if (booking.client) {
              this.selectedClient.set(booking.client);
            }
          },
          error: () => this.error.set('Impossible de charger cette réservation.'),
        });
      }
    });
  }

  onClientSearchChange(value: string): void {
    this.clientSearch.set(value);
    if (value.trim().length >= 2) {
      this.clientSearch$.next(value.trim());
    } else {
      this.clientResults.set([]);
    }
  }

  selectClient(client: Client): void {
    this.selectedClient.set(client);
    this.clientSearch.set('');
    this.clientResults.set([]);
    this.showNewClientForm.set(false);
  }

  clearClient(): void {
    this.selectedClient.set(null);
  }

  toggleNewClientForm(): void {
    this.showNewClientForm.set(!this.showNewClientForm());
    this.clientResults.set([]);
  }

  submitNewClient(): void {
    if (!this.newClientFirstname().trim() || !this.newClientLastname().trim()) {
      return;
    }

    this.savingClient.set(true);
    this.clientService
      .create({
        firstname: this.newClientFirstname().trim(),
        lastname: this.newClientLastname().trim(),
        phone: this.newClientPhone().trim() || undefined,
      })
      .subscribe({
        next: (client) => {
          this.savingClient.set(false);
          this.newClientFirstname.set('');
          this.newClientLastname.set('');
          this.newClientPhone.set('');
          this.selectClient(client);
        },
        error: () => this.savingClient.set(false),
      });
  }

  submit(): void {
    const client = this.selectedClient();
    if (!client) {
      this.error.set('Sélectionne un client.');
      return;
    }

    this.error.set(null);
    this.saving.set(true);

    const payload = {
      client_id: client.id,
      number_of_guests: this.numberOfGuests(),
      type: this.type(),
      date: this.date(),
      hour: this.hour(),
    };

    const request =
      this.isEdit() && this.id !== null
        ? this.bookingService.update(this.id, payload)
        : this.bookingService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/reservations'),
      error: (err) => {
        this.saving.set(false);
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.error.set(
          messages?.length ? messages.join(' ') : err.error?.message ?? "Impossible d'enregistrer cette réservation.",
        );
      },
    });
  }

  private todayIso(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
