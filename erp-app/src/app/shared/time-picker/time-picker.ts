import { Component, ElementRef, HostListener, Input, computed, forwardRef, inject, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

/**
 * Remplace <input type="time"> par un sélecteur heures/minutes stylé cohérent avec le reste de
 * l'app (voir Readme.md : "plus UI friendly... dans le même style que toute l'app"). Implémente
 * ControlValueAccessor pour rester utilisable avec [ngModel]/(ngModelChange) exactement comme
 * un <input> natif. Valeur exposée : chaîne "HH:mm" (même format que le natif), ou null si vide.
 */
@Component({
  selector: 'app-time-picker',
  standalone: true,
  templateUrl: './time-picker.html',
  styleUrl: './time-picker.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TimePicker),
      multi: true,
    },
  ],
})
export class TimePicker implements ControlValueAccessor {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  @Input() placeholder = 'Choisir une heure';

  readonly hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  // Que des quarts d'heure — largement suffisant pour une heure de début d'événement, et une
  // colonne de 4 éléments est plus rapide à parcourir qu'une liste de 60 (voir Readme.md).
  readonly minutes = ['00', '15', '30', '45'];

  readonly open = signal(false);
  readonly value = signal<string | null>(null);
  readonly disabled = signal(false);

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  readonly selectedHour = computed(() => this.value()?.split(':')[0] ?? null);
  readonly selectedMinute = computed(() => this.value()?.split(':')[1] ?? null);

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
    const next = !this.open();
    this.open.set(next);
    if (next) {
      setTimeout(() => this.scrollSelectedIntoView());
    }
  }

  selectHour(hour: string): void {
    this.setValue(hour, this.selectedMinute() ?? '00');
  }

  selectMinute(minute: string): void {
    this.setValue(this.selectedHour() ?? '00', minute);
  }

  clear(event: Event): void {
    event.stopPropagation();
    this.value.set(null);
    this.onChange(null);
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

  private setValue(hour: string, minute: string): void {
    const next = `${hour}:${minute}`;
    this.value.set(next);
    this.onChange(next);
    this.onTouched();
  }

  private scrollSelectedIntoView(): void {
    // Seule la colonne des heures défile encore (24 valeurs) — les minutes tiennent
    // maintenant entièrement sans scroll (voir .tp__list--minutes), scrollIntoView dessus
    // remonterait jusqu'au premier ancêtre scrollable (la page) et provoquerait un saut.
    this.elementRef.nativeElement
      .querySelectorAll<HTMLElement>('.tp__list:not(.tp__list--minutes) .tp__item--selected')
      .forEach((el) => el.scrollIntoView({ block: 'center' }));
  }
}
