import { Component, ElementRef, HostListener, Input, computed, forwardRef, inject, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

interface MonthCell {
  month: number;
  label: string;
  isCurrent: boolean;
  isSelected: boolean;
}

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

/**
 * Remplace <input type="month"> par un sélecteur stylé cohérent avec le reste de l'app — même
 * pattern que app-date-picker (voir shared/date-picker/date-picker.ts) mais navigation par année
 * et grille de 12 mois plutôt qu'un calendrier jour par jour, puisqu'un mois n'a pas de "jour".
 * Implémente ControlValueAccessor pour rester utilisable avec [ngModel]/(ngModelChange) exactement
 * comme le natif. Valeur exposée : chaîne "YYYY-MM" (même format que le natif), ou null si vide.
 */
@Component({
  selector: 'app-month-picker',
  standalone: true,
  templateUrl: './month-picker.html',
  styleUrl: './month-picker.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MonthPicker),
      multi: true,
    },
  ],
})
export class MonthPicker implements ControlValueAccessor {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  @Input() placeholder = 'Choisir un mois';

  readonly open = signal(false);
  readonly value = signal<string | null>(null);
  readonly disabled = signal(false);

  private readonly today = new Date();

  readonly viewYear = signal(this.today.getFullYear());

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  readonly displayLabel = computed(() => {
    const value = this.value();
    if (!value) {
      return null;
    }
    const [year, month] = value.split('-').map(Number);
    const label = new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  readonly cells = computed<MonthCell[]>(() => {
    const year = this.viewYear();
    const selected = this.value();
    const selectedYear = selected ? Number(selected.split('-')[0]) : null;
    const selectedMonth = selected ? Number(selected.split('-')[1]) - 1 : null;

    return MONTH_LABELS.map((label, month) => ({
      month,
      label,
      isCurrent: year === this.today.getFullYear() && month === this.today.getMonth(),
      isSelected: year === selectedYear && month === selectedMonth,
    }));
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

  selectMonth(cell: MonthCell): void {
    const key = `${this.viewYear()}-${String(cell.month + 1).padStart(2, '0')}`;
    this.value.set(key);
    this.onChange(key);
    this.onTouched();
    this.open.set(false);
  }

  clear(event: Event): void {
    event.stopPropagation();
    this.value.set(null);
    this.onChange(null);
  }

  prevYear(): void {
    this.viewYear.update((year) => year - 1);
  }

  nextYear(): void {
    this.viewYear.update((year) => year + 1);
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
    this.viewYear.set(value ? Number(value.split('-')[0]) : this.today.getFullYear());
  }
}
