import { Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import jsQR from 'jsqr';
import { AuthService } from '../../core/auth.service';

type Mode = 'qr' | 'password';
type Field = 'username' | 'password';

const KEYBOARD_ROWS = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN', '0123456789'];

/**
 * Écran de connexion du kiosque — même pattern que erp_validate_event/erp_kitchen_display (scan
 * QR du badge personnel par défaut, repli clavier visuel). Le mode QR self-order (routes
 * self-order/{qr_token}, page Order) ne passe jamais par ici, cette page ne sert qu'à
 * l'authentification du kiosque staff (voir app.routes.ts, /kiosk/*).
 */
@Component({
  selector: 'app-kiosk-login',
  imports: [],
  templateUrl: './kiosk-login.html',
  styleUrl: './kiosk-login.css',
})
export class KioskLogin implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly keyboardRows = KEYBOARD_ROWS;

  readonly mode = signal<Mode>('qr');
  readonly activeField = signal<Field>('username');
  readonly username = signal('');
  readonly password = signal('');

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly scanning = signal(false);
  readonly scanError = signal<string | null>(null);
  readonly shiftOn = signal(false);

  @ViewChild('scanVideo') private readonly scanVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('scanCanvas') private readonly scanCanvasRef?: ElementRef<HTMLCanvasElement>;
  private scanStream: MediaStream | null = null;
  private scanFrameId: number | null = null;

  constructor() {
    this.startScan();
  }

  setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set(null);
    if (mode === 'qr') {
      this.startScan();
    } else {
      this.stopScan();
    }
  }

  selectField(field: Field): void {
    this.activeField.set(field);
  }

  toggleShift(): void {
    this.shiftOn.set(!this.shiftOn());
  }

  pressKey(key: string): void {
    const target = this.activeField() === 'username' ? this.username : this.password;
    const char = this.shiftOn() ? key : key.toLowerCase();
    target.set((target() + char).slice(0, 40));
  }

  backspace(): void {
    const target = this.activeField() === 'username' ? this.username : this.password;
    target.set(target().slice(0, -1));
  }

  clearField(): void {
    const target = this.activeField() === 'username' ? this.username : this.password;
    target.set('');
  }

  submitPassword(): void {
    if (!this.username().trim() || !this.password() || this.submitting()) {
      return;
    }

    this.error.set(null);
    this.submitting.set(true);

    this.authService.loginWithPassword(this.username().trim(), this.password()).subscribe({
      next: () => this.router.navigateByUrl('/kiosk/setup'),
      error: (err) => {
        this.submitting.set(false);
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.error.set(messages?.length ? messages.join(' ') : 'Impossible de se connecter.');
      },
    });
  }

  async startScan(): Promise<void> {
    this.scanError.set(null);

    try {
      this.scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch {
      this.scanError.set("Impossible d'accéder à la caméra (permission refusée ou aucune caméra disponible).");
      return;
    }

    this.scanning.set(true);

    setTimeout(() => {
      const video = this.scanVideoRef?.nativeElement;
      if (!video) {
        return;
      }
      video.srcObject = this.scanStream;
      video.play();
      this.scanFrameId = requestAnimationFrame(() => this.scanFrame());
    });
  }

  stopScan(): void {
    if (this.scanFrameId !== null) {
      cancelAnimationFrame(this.scanFrameId);
      this.scanFrameId = null;
    }
    this.scanStream?.getTracks().forEach((track) => track.stop());
    this.scanStream = null;
    this.scanning.set(false);
  }

  private scanFrame(): void {
    const video = this.scanVideoRef?.nativeElement;
    const canvas = this.scanCanvasRef?.nativeElement;

    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      this.scanFrameId = requestAnimationFrame(() => this.scanFrame());
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height);

    if (result?.data && !this.submitting()) {
      this.loginWithQr(result.data.trim());
      return;
    }

    this.scanFrameId = requestAnimationFrame(() => this.scanFrame());
  }

  private loginWithQr(barcode: string): void {
    this.submitting.set(true);
    this.error.set(null);

    this.authService.loginWithBarcode(barcode).subscribe({
      next: () => {
        this.stopScan();
        this.router.navigateByUrl('/kiosk/setup');
      },
      error: (err) => {
        this.submitting.set(false);
        this.error.set(err.error?.errors?.barcode?.[0] ?? 'Code QR invalide.');
        this.scanFrameId = requestAnimationFrame(() => this.scanFrame());
      },
    });
  }

  ngOnDestroy(): void {
    this.stopScan();
  }
}
