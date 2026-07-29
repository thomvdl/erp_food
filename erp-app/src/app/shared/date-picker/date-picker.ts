import { Component, ElementRef, HostListener, Input, computed, forwardRef, inject, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

interface DayCell {
  day: number;
  dateKey: string;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

const WEEKDAY_LABELS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

/**
 * Remplace <input type="date"> par un calendrier stylé cohérent avec le reste de l'app (mêmes
 * tokens que .calendar-grid/.calendar-cell déjà utilisés sur les pages événements) — voir
 * Readme.md : "plus UI friendly... dans le même style que toute l'app". Implémente
 * ControlValueAccessor pour rester utilisable avec [ngModel]/(ngModelChange) exactement comme
 * un <input> natif, sans changer la forme des formulaires qui l'utilisent.
 * Valeur exposée : chaîne "YYYY-MM-DD" (même format que le natif), ou null si vide.
 */
@Component({
  selector: 'app-date-picker',
  standalone: true,
  templateUrl: './date-picker.html',
  styleUrl: './date-picker.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DatePicker),
      multi: true,
    },
  ],
})
export class DatePicker implements ControlValueAccessor {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  @Input() placeholder = 'Choisir une date';

  readonly weekdayLabels = WEEKDAY_LABELS;
  readonly open = signal(false);
  readonly value = signal<string | null>(null);
  readonly disabled = signal(false);

  private readonly today = new Date();
  private readonly todayKey = this.toKey(this.today);

  readonly viewYear = signal(this.today.getFullYear());
  readonly viewMonth = signal(this.today.getMonth());

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  readonly displayLabel = computed(() => {
    const value = this.value();
    if (!value) {
      return null;
    }
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  });

  readonly monthLabel = computed(() => {
    const label = new Date(this.viewYear(), this.viewMonth(), 1).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  readonly cells = computed<DayCell[]>(() => {
    const year = this.viewYear();
    const month = this.viewMonth();
    const selected = this.value();

    const firstOfMonth = new Date(year, month, 1);
    const leadingBlankDays = (firstOfMonth.getDay() + 6) % 7;
    const startDate = new Date(year, month, 1 - leadingBlankDays);

    return Array.from({ length: 42 }, (_, i) => {
      const cellDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
      const key = this.toKey(cellDate);
      return {
        day: cellDate.getDate(),
        dateKey: key,
        inMonth: cellDate.getMonth() === month,
        isToday: key === this.todayKey,
        isSelected: key === selected,
      };
    });
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
      this.onTouched();
    }
  }

  toggle(): void {
    if (this.disabled()) {
      return;
    }
    if (!this.open()) {
      this.syncViewToValue();
    }
    this.open.set(!this.open());
  }

  selectDay(cell: DayCell): void {
    this.value.set(cell.dateKey);
    this.onChange(cell.dateKey);
    this.onTouched();
    this.open.set(false);
  }

  clear(event: Event): void {
    event.stopPropagation();
    this.value.set(null);
    this.onChange(null);
  }

  prevMonth(): void {
    this.shiftMonth(-1);
  }

  nextMonth(): void {
    this.shiftMonth(1);
  }

  writeValue(value: string | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  private syncViewToValue(): void {
    const value = this.value();
    if (!value) {
      this.viewYear.set(this.today.getFullYear());
      this.viewMonth.set(this.today.getMonth());
      return;
    }
    const [year, month] = value.split('-').map(Number);
    this.viewYear.set(year);
    this.viewMonth.set(month - 1);
  }

  private shiftMonth(delta: number): void {
    const next = new Date(this.viewYear(), this.viewMonth() + delta, 1);
    this.viewYear.set(next.getFullYear());
    this.viewMonth.set(next.getMonth());
  }

  private toKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
