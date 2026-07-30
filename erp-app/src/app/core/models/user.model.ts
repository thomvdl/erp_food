export interface Role {
  id: number;
  name: string;
  slug: string;
  /** "Ne plus avoir la possibilité de supprimer... ajouter un champ active" (voir Readme.md). */
  active: boolean;
}

export interface User {
  id: number;
  username: string;
  email: string;
  /** write-only : jamais présent dans une réponse GET (hashé côté back) */
  password?: string;
  /** Secret encodé dans le QR de connexion — voir AuthService.loginWithBarcode(). Null tant qu'aucun QR n'a été généré (UserService.generateQrCode()). */
  barcode: string | null;
  roles: Role[];
  /** write-only : envoyé en payload create/update, jamais renvoyé tel quel (voir `roles`) */
  role_ids?: number[];
  /** "Ne plus avoir la possibilité de supprimer... ajouter un champ active" (voir Readme.md). */
  active: boolean;
}
