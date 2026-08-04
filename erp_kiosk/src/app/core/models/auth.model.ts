export interface AuthUser {
  id: number;
  username: string;
  email: string;
  barcode: string | null;
  roles: { id: number; name: string; slug: string }[];
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}
