import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, ViewChild, computed, forwardRef, inject, signal } from '@angular/core';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

const HEX_PATTERN = /^#([0-9a-f]{6})$/i;

/** Palette de couleurs vives adaptée à un fond de bannière plein écran (kiosque) — distincte des
 *  tokens --color-*-bg de styles.css, pensés pour des fonds discrets de badge/alerte. */
const PRESET_COLORS = [
  '#f98603', '#16233f', '#dc2626', '#16a34a', '#2563eb',
  '#7c3aed', '#db2777', '#0d9488', '#475569', '#111827',
];

/**
 * Remplace le <input type="color"> natif (rendu minuscule et peu lisible) par un bouton pastille +
 * code hex, avec une palette de couleurs suggérées et un champ hex éditable — voir Readme.md
 * "gestion bannière... color picker plus UI friendly". Le natif reste utilisé en interne pour le
 * choix "Personnalisé" (roue de sélection du système), plutôt que réimplémenter un sélecteur HSV.
 * Implémente ControlValueAccessor pour rester utilisable avec [ngModel]/(ngModelChange) exactement
 * comme l'input natif qu'il remplace (voir date-picker.ts, même pattern).
 */
@Component({
  selector: 'app-color-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './color-picker.html',
  styleUrl: './color-picker.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ColorPicker),
      multi: true,
    },
  ],
})
export class ColorPicker implements ControlValueAccessor {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  @Input() label = 'Couleur';
  @ViewChild('nativeInput') nativeInput?: ElementRef<HTMLInputElement>;

  readonly presets = PRESET_COLORS;
  readonly open = signal(false);
  readonly value = signal('#000000');
  readonly disabled = signal(false);
  readonly hexDraft = signal('#000000');
  readonly hexInvalid = signal(false);

  readonly isPreset = computed(() => this.presets.some((preset) => preset.toLowerCase() === this.value().toLowerCase()));

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  toggle(): void {
    if (this.disabled()) {
      return;
    }
    if (!this.open()) {
      this.hexDraft.set(this.value());
      this.hexInvalid.set(false);
    }
    this.open.set(!this.open());
  }

  selectPreset(color: string): void {
    this.setValue(color);
    this.close();
  }

  openNativePicker(): void {
    this.nativeInput?.nativeElement.click();
  }

  onNativeInput(event: Event): void {
    const color = (event.target as HTMLInputElement).value;
    this.setValue(color);
    this.hexDraft.set(color);
    this.hexInvalid.set(false);
  }

  onHexDraftChange(raw: string): void {
    const candidate = raw.startsWith('#') ? raw : `#${raw}`;
    this.hexDraft.set(candidate);

    if (HEX_PATTERN.test(candidate)) {
      this.hexInvalid.set(false);
      this.setValue(candidate);
    } else {
      this.hexInvalid.set(true);
    }
  }

  writeValue(value: string | null): void {
    const color = value && HEX_PATTERN.test(value) ? value : '#000000';
    this.value.set(color);
    this.hexDraft.set(color);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  private setValue(color: string): void {
    this.value.set(color);
    this.onChange(color);
  }

  private close(): void {
    this.open.set(false);
    this.onTouched();
  }
}
