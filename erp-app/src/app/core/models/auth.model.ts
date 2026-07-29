import { Role } from './user.model';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  barcode: string | null;
  roles: Role[];
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}
