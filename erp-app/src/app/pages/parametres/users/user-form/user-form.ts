import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UserService } from '../../../../core/user.service';
import { RoleService } from '../../../../core/role.service';
import { Role } from '../../../../core/models/user.model';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './user-form.html',
})
export class UserForm implements OnDestroy {
  private readonly userService = inject(UserService);
  private readonly roleService = inject(RoleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);

  readonly roles = signal<Role[]>([]);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  readonly username = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly roleIds = signal<number[]>([]);

  readonly barcode = signal<string | null>(null);
  readonly qrImageUrl = signal<string | null>(null);
  readonly generatingQr = signal(false);
  readonly showRegenerateConfirm = signal(false);
  readonly sendingQrEmail = signal(false);
  readonly qrEmailSent = signal(false);
  private qrObjectUrl: string | null = null;
  // Data URI (pas l'URL blob ci-dessus) pour la fenêtre d'impression : elle s'ouvre via
  // window.open('', '_blank') puis document.write, un contexte séparé où l'URL blob de la
  // fenêtre d'origine n'est pas garantie accessible — une data URI, si.
  private qrDataUri: string | null = null;

  constructor() {
    this.roleService.list().subscribe((roles) => this.roles.set(roles));

    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.userService.get(this.id).subscribe({
          next: (user) => {
            this.username.set(user.username);
            this.email.set(user.email);
            this.roleIds.set(user.roles.map((role) => role.id));
            this.barcode.set(user.barcode);
            if (user.barcode) {
              this.loadQrImage();
            }
          },
          error: () => this.error.set("Impossible de charger l'utilisateur."),
        });
      }
    });
  }

  /** Régénérer invalide l'ancien QR (imprimé/envoyé) — passe par une confirmation. La toute
   *  première génération n'a rien à invalider, pas besoin de confirmer. */
  requestGenerateQrCode(): void {
    if (this.barcode()) {
      this.showRegenerateConfirm.set(true);
      return;
    }

    this.generateQrCode();
  }

  confirmRegenerate(): void {
    this.showRegenerateConfirm.set(false);
    this.generateQrCode();
  }

  cancelRegenerate(): void {
    this.showRegenerateConfirm.set(false);
  }

  sendQrEmail(): void {
    if (this.id === null) {
      return;
    }

    this.sendingQrEmail.set(true);
    this.qrEmailSent.set(false);
    this.error.set(null);

    this.userService.sendQrEmail(this.id).subscribe({
      next: () => {
        this.sendingQrEmail.set(false);
        this.qrEmailSent.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.sendingQrEmail.set(false);
        this.error.set(this.extractErrorMessage(err));
      },
    });
  }

  private generateQrCode(): void {
    if (this.id === null) {
      return;
    }

    this.generatingQr.set(true);
    this.qrEmailSent.set(false);
    this.userService.generateQrCode(this.id).subscribe({
      next: (user) => {
        this.generatingQr.set(false);
        this.barcode.set(user.barcode);
        this.loadQrImage();
      },
      error: () => {
        this.generatingQr.set(false);
        this.error.set('Impossible de générer le QR code.');
      },
    });
  }

  /**
   * "Imprimer / exporter en PDF" (voir Readme.md) : pas de librairie PDF ajoutée — on ouvre le
   * dialogue d'impression natif du navigateur, où "Enregistrer en PDF" est une destination
   * disponible au même titre qu'une imprimante physique. Évite une dépendance supplémentaire
   * pour un outil interne.
   */
  printQrCode(): void {
    if (!this.qrDataUri) {
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="utf-8">
        <title>QR de connexion — ${this.username()}</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; text-align: center; padding: 40px; }
          h1 { font-size: 18px; }
          img { width: 240px; height: 240px; margin-top: 16px; }
        </style>
      </head>
      <body>
        <h1>${this.username()}</h1>
        <img src="${this.qrDataUri}" alt="QR de connexion" />
      </body>
      </html>
    `);
    printWindow.document.close();

    const img = printWindow.document.images[0];
    if (img.complete) {
      printWindow.print();
    } else {
      img.onload = () => printWindow.print();
    }
  }

  private loadQrImage(): void {
    if (this.id === null) {
      return;
    }

    this.userService.getQrBlob(this.id).subscribe((blob) => {
      this.revokeQrObjectUrl();
      this.qrObjectUrl = URL.createObjectURL(blob);
      this.qrImageUrl.set(this.qrObjectUrl);

      const reader = new FileReader();
      reader.onload = () => (this.qrDataUri = reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  private revokeQrObjectUrl(): void {
    if (this.qrObjectUrl) {
      URL.revokeObjectURL(this.qrObjectUrl);
      this.qrObjectUrl = null;
    }
  }

  ngOnDestroy(): void {
    this.revokeQrObjectUrl();
  }

  isRoleChecked(roleId: number): boolean {
    return this.roleIds().includes(roleId);
  }

  toggleRole(roleId: number, checked: boolean): void {
    const current = this.roleIds();
    this.roleIds.set(checked ? [...current, roleId] : current.filter((id) => id !== roleId));
  }

  submit(): void {
    this.error.set(null);

    if (!this.isEdit() && !this.password()) {
      this.error.set('Le mot de passe est obligatoire pour un nouvel utilisateur.');
      return;
    }

    this.saving.set(true);

    const payload = {
      username: this.username(),
      email: this.email(),
      password: this.password() || undefined,
      role_ids: this.roleIds(),
    };

    const request =
      this.isEdit() && this.id !== null
        ? this.userService.update(this.id, payload)
        : this.userService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/parametres/utilisateurs'),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(this.extractErrorMessage(err));
      },
    });
  }

  private extractErrorMessage(err: HttpErrorResponse): string {
    const errors = err.error?.errors as Record<string, string[]> | undefined;

    if (errors) {
      return Object.values(errors).flat().join(' ');
    }

    return "Impossible d'enregistrer l'utilisateur.";
  }
}
