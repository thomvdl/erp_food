import { Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import jsQR from 'jsqr';

/**
 * Atteinte seulement si quelqu'un ouvre l'app sans token de table dans l'URL (l'usage normal est
 * de scanner un QR avec l'appareil photo natif du téléphone, qui pointe directement vers
 * /:qrToken). Ajoute ici un scan intégré (même pattern que kiosk-login.ts) pour les clients qui
 * arrivent sur l'accueil sans être déjà passés par un lien direct — ex. app ajoutée à l'écran
 * d'accueil, lien mal recopié, etc.
 */
@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnDestroy {
  private readonly router = inject(Router);

  readonly scanning = signal(false);
  readonly scanError = signal<string | null>(null);

  @ViewChild('scanVideo') private readonly scanVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('scanCanvas') private readonly scanCanvasRef?: ElementRef<HTMLCanvasElement>;
  private scanStream: MediaStream | null = null;
  private scanFrameId: number | null = null;
  private navigating = false;

  async startScan(): Promise<void> {
    this.scanError.set(null);

    try {
      this.scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch {
      this.scanError.set("Impossible d'accéder à la caméra (permission refusée ou aucune caméra disponible).");
      return;
    }

    this.scanning.set(true);
    this.navigating = false;

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

    if (result?.data && !this.navigating) {
      this.handleScanned(result.data.trim());
      return;
    }

    this.scanFrameId = requestAnimationFrame(() => this.scanFrame());
  }

  /**
   * Le QR imprimé encode l'URL complète vers cette table (voir SelfOrderController::qr —
   * self_order_url + qr_token). On n'utilise que le chemin pour rester dans l'app Angular (pas de
   * rechargement complet) — ça marche même si le host scanné diffère de l'origine courante (IP
   * LAN vs domaine configuré, etc.), seul le dernier segment du chemin (le token) compte pour
   * SelfOrderController côté API.
   */
  private handleScanned(data: string): void {
    let path: string;
    try {
      path = new URL(data).pathname;
    } catch {
      path = data.startsWith('/') ? data : `/${data}`;
    }

    const token = path.split('/').filter(Boolean).pop();
    if (!token) {
      this.scanError.set("Ce QR code n'est pas reconnu — réessayez.");
      this.scanFrameId = requestAnimationFrame(() => this.scanFrame());
      return;
    }

    this.navigating = true;
    this.stopScan();
    this.router.navigateByUrl(`/${token}`);
  }

  ngOnDestroy(): void {
    this.stopScan();
  }
}
