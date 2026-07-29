import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { API_URL } from './api-config';
import { CachedResourceService } from './cached-resource.service';
import { User } from './models/user.model';

@Injectable({ providedIn: 'root' })
export class UserService extends CachedResourceService<User> {
  protected readonly endpoint = 'users';

  /** (Re)génère le QR de connexion de cet utilisateur — invalide un QR déjà imprimé/affiché. */
  generateQrCode(id: number): Observable<User> {
    return this.http.post<User>(`${API_URL}/users/${id}/qr-code`, {}).pipe(tap(() => this.invalidate()));
  }

  /** Récupéré en blob (jamais en <img src="..."> direct) : cette route exige un Bearer token,
   *  qu'une balise <img> ne peut pas joindre — voir routes/api.php côté erp-api. */
  getQrBlob(id: number): Observable<Blob> {
    return this.http.get(`${API_URL}/users/${id}/qr`, { responseType: 'blob' });
  }

  sendQrEmail(id: number): Observable<void> {
    return this.http.post<void>(`${API_URL}/users/${id}/qr-code/email`, {});
  }
}
