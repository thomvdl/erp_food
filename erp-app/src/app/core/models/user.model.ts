export interface Role {
  id: number;
  name: string;
  slug: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  /** write-only : jamais présent dans une réponse GET (hashé côté back) */
  password?: string;
  roles: Role[];
  /** write-only : envoyé en payload create/update, jamais renvoyé tel quel (voir `roles`) */
  role_ids?: number[];
}
